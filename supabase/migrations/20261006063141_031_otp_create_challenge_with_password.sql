-- Let the login flow verify the password in the same call that creates the
-- challenge, so signing in is one server round trip instead of two (resolve +
-- password check through the auth server, then create). The optional
-- p_password is only supplied for the 'login' purpose; every other purpose
-- leaves it null and behaves exactly as before.
drop function if exists public.otp_create_challenge(uuid, text, text, text);

create or replace function public.otp_create_challenge(
  p_user_id uuid,
  p_purpose text,
  p_channel text,
  p_destination text default null,
  p_password text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role        text;
  v_email       text;
  v_phone       text;
  v_allowed     text[];
  v_destination text;
  v_code        text;
  v_salt        text;
  v_row         public.otp_challenges%rowtype;
  v_new_count   integer;
  v_window      timestamptz;
begin
  if p_purpose not in ('login','verification','password_recovery','contact_change') then
    raise exception 'Invalid purpose';
  end if;
  if p_channel not in ('email','sms') then
    raise exception 'Invalid channel';
  end if;

  select role, email, phone into v_role, v_email, v_phone
  from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'Account not found';
  end if;

  -- Verify the password here, before any code is created, when the caller
  -- supplied one. Comparing against the stored bcrypt hash avoids a second
  -- round trip to the auth server. A wrong password never creates a challenge.
  if p_password is not null then
    if not exists (
      select 1 from auth.users u
      where u.id = p_user_id
        and u.encrypted_password is not null
        and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
    ) then
      raise exception 'Invalid sign-in ID or password';
    end if;
  end if;

  v_allowed := public.otp_allowed_channels(v_role);
  if not (p_channel = any (v_allowed)) then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    values (auth.uid(), 'otp_channel_blocked', 'account', p_user_id,
            jsonb_build_object('role', v_role, 'requested_channel', p_channel));
    raise exception 'This verification method is not available for your account';
  end if;

  if p_channel = 'email' then
    v_destination := nullif(v_email, '');
    if v_destination is null then
      raise exception 'No email address is on file for this account';
    end if;
  else
    v_destination := public.normalize_phone(coalesce(nullif(p_destination, ''), v_phone));
    if v_destination is null or v_destination !~ '^0[0-9]{10}$' then
      raise exception 'A valid Philippine mobile number is required';
    end if;
  end if;

  select * into v_row from public.otp_challenges
  where user_id = p_user_id and purpose = p_purpose for update;

  if found then
    if v_row.resend_available_at > now() then
      raise exception 'Please wait % seconds before requesting another code',
        greatest(1, ceil(extract(epoch from (v_row.resend_available_at - now())))::int);
    end if;

    v_window := v_row.window_started_at;
    if v_window < now() - interval '1 hour' then
      v_new_count := 1;
      v_window := now();
    else
      if v_row.send_count >= 5 then
        insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
        values (auth.uid(), 'otp_rate_limited', 'account', p_user_id,
                jsonb_build_object('purpose', p_purpose, 'channel', p_channel));
        raise exception 'Too many codes requested. Please try again later.';
      end if;
      v_new_count := v_row.send_count + 1;
    end if;
  else
    v_new_count := 1;
    v_window := now();
  end if;

  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
    6, '0'
  );
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.otp_challenges
    (user_id, purpose, channel, destination, otp_hash, salt, expires_at,
     attempts, resend_available_at, send_count, window_started_at, consumed_at, updated_at)
  values
    (p_user_id, p_purpose, p_channel, v_destination,
     encode(extensions.digest(v_code || ':' || v_salt, 'sha256'), 'hex'),
     v_salt, now() + interval '5 minutes',
     0, now() + interval '60 seconds', v_new_count, v_window, null, now())
  on conflict (user_id, purpose) do update set
    channel             = excluded.channel,
    destination         = excluded.destination,
    otp_hash            = excluded.otp_hash,
    salt                = excluded.salt,
    expires_at          = excluded.expires_at,
    attempts            = 0,
    resend_available_at = excluded.resend_available_at,
    send_count          = excluded.send_count,
    window_started_at   = excluded.window_started_at,
    consumed_at         = null,
    updated_at          = now();

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (auth.uid(), 'otp_sent', 'account', p_user_id,
          jsonb_build_object('purpose', p_purpose, 'channel', p_channel));

  return json_build_object(
    'ok', true,
    'otp', v_code,
    'destination', v_destination,
    'channel', p_channel,
    'expires_in', 300,
    'resend_in', 60
  );
end;
$function$;
