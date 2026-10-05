-- Public self-registration must only ever create Resident accounts.
--
-- The previous version of this function accepted a role from the browser and
-- allowed 'super_admin', so any visitor could register themselves as a Super
-- Admin. The role is now fixed server-side to 'user'; staff accounts are created
-- exclusively through the account-admin edge function, which validates the
-- creator's role against the authoritative matrix in admin_create_account.

drop function if exists public.public_complete_registration(text, text, text, uuid);

create or replace function public.public_complete_registration(
  p_full_name text default '',
  p_phone text default '',
  p_barangay_id uuid default null,
  p_address text default ''
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role_done timestamptz;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if not public.is_open_registration_enabled() then
    raise exception 'Open registration is not enabled';
  end if;

  select role_selected_at into v_role_done from public.profiles where id = v_uid;

  if v_role_done is not null then
    raise exception 'A role has already been set for this account';
  end if;

  update public.profiles
  set role = 'user',
      full_name = coalesce(nullif(p_full_name, ''), full_name),
      phone = coalesce(public.normalize_phone(nullif(p_phone, '')), phone),
      barangay_id = coalesce(p_barangay_id, barangay_id),
      address = coalesce(nullif(p_address, ''), address),
      role_selected_at = now(),
      updated_at = now()
  where id = v_uid;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'user')
  where id = v_uid;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_uid, 'account_role_selected', 'account', v_uid,
          jsonb_build_object('role', 'user', 'source', 'public_registration'));

  return json_build_object('ok', true, 'role', 'user');
end;
$function$;

revoke all on function public.public_complete_registration(text, text, uuid, text) from public;
grant execute on function public.public_complete_registration(text, text, uuid, text) to authenticated;
