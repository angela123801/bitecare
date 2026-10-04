/*
# Fix OTP crypto function resolution (pgcrypto lives in the extensions schema)

## Summary
pgcrypto is installed in the `extensions` schema on this project, but the OTP
functions run with `SET search_path = public`. Unqualified calls to
`digest(...)` and `gen_random_bytes(...)` therefore fail at runtime with
"function ... does not exist".

## 1. Fixed — otp_create_challenge
Now calls `extensions.gen_random_bytes(...)` and `extensions.digest(...)`
explicitly. Code generation and hashing work again.

## 2. Fixed — otp_verify_challenge
Now calls `extensions.digest(...)` explicitly.

## 3. Fixed — generate_verification_otp / verify_account_otp
These pre-existing functions (used when an admin creates an account that
requires verification) had the same unqualified `digest(...)` call and would
fail the same way. Both now schema-qualify the call.

## 4. Notes
- No tables, columns or policies change.
- No secrets or OTP values are affected.
- Schema-qualifying the extension functions is preferred over widening
  search_path, since a wider path is a security risk in SECURITY DEFINER code.
*/

-- ---------- otp_create_challenge: schema-qualified crypto ----------
CREATE OR REPLACE FUNCTION public.otp_create_challenge(
  p_user_id     uuid,
  p_purpose     text,
  p_channel     text,
  p_destination text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_email       text;
  v_phone       text;
  v_allowed     text[];
  v_destination text;
  v_code        text;
  v_salt        text;
  v_row         public.otp_challenges%ROWTYPE;
  v_new_count   integer;
  v_window      timestamptz;
BEGIN
  IF p_purpose NOT IN ('login','verification','password_recovery','contact_change') THEN
    RAISE EXCEPTION 'Invalid purpose';
  END IF;
  IF p_channel NOT IN ('email','sms') THEN
    RAISE EXCEPTION 'Invalid channel';
  END IF;

  SELECT role, email, phone INTO v_role, v_email, v_phone
    FROM public.profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  v_allowed := public.otp_allowed_channels(v_role);
  IF NOT (p_channel = ANY (v_allowed)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    VALUES (auth.uid(), 'otp_channel_blocked', 'account', p_user_id,
            jsonb_build_object('role', v_role, 'requested_channel', p_channel));
    RAISE EXCEPTION 'This verification method is not available for your account';
  END IF;

  IF p_channel = 'email' THEN
    v_destination := NULLIF(v_email, '');
    IF v_destination IS NULL THEN
      RAISE EXCEPTION 'No email address is on file for this account';
    END IF;
  ELSE
    v_destination := public.normalize_phone(COALESCE(NULLIF(p_destination, ''), v_phone));
    IF v_destination IS NULL OR v_destination !~ '^0[0-9]{10}$' THEN
      RAISE EXCEPTION 'A valid Philippine mobile number is required';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.otp_challenges
    WHERE user_id = p_user_id AND purpose = p_purpose FOR UPDATE;

  IF FOUND THEN
    IF v_row.resend_available_at > now() THEN
      RAISE EXCEPTION 'Please wait % seconds before requesting another code',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.resend_available_at - now())))::int);
    END IF;

    v_window := v_row.window_started_at;
    IF v_window < now() - interval '1 hour' THEN
      v_new_count := 1;
      v_window := now();
    ELSE
      IF v_row.send_count >= 5 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
        VALUES (auth.uid(), 'otp_rate_limited', 'account', p_user_id,
                jsonb_build_object('purpose', p_purpose, 'channel', p_channel));
        RAISE EXCEPTION 'Too many codes requested. Please try again later.';
      END IF;
      v_new_count := v_row.send_count + 1;
    END IF;
  ELSE
    v_new_count := 1;
    v_window := now();
  END IF;

  v_code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
    6, '0'
  );
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.otp_challenges
    (user_id, purpose, channel, destination, otp_hash, salt, expires_at,
     attempts, resend_available_at, send_count, window_started_at, consumed_at, updated_at)
  VALUES
    (p_user_id, p_purpose, p_channel, v_destination,
     encode(extensions.digest(v_code || ':' || v_salt, 'sha256'), 'hex'),
     v_salt, now() + interval '5 minutes',
     0, now() + interval '60 seconds', v_new_count, v_window, NULL, now())
  ON CONFLICT (user_id, purpose) DO UPDATE SET
    channel             = EXCLUDED.channel,
    destination         = EXCLUDED.destination,
    otp_hash            = EXCLUDED.otp_hash,
    salt                = EXCLUDED.salt,
    expires_at          = EXCLUDED.expires_at,
    attempts            = 0,
    resend_available_at = EXCLUDED.resend_available_at,
    send_count          = EXCLUDED.send_count,
    window_started_at   = EXCLUDED.window_started_at,
    consumed_at         = NULL,
    updated_at          = now();

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'otp_sent', 'account', p_user_id,
          jsonb_build_object('purpose', p_purpose, 'channel', p_channel));

  RETURN json_build_object(
    'ok', true,
    'otp', v_code,
    'destination', v_destination,
    'channel', p_channel,
    'expires_in', 300,
    'resend_in', 60
  );
END;
$$;

REVOKE ALL ON FUNCTION public.otp_create_challenge(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_create_challenge(uuid, text, text, text) TO service_role;

-- ---------- otp_verify_challenge: schema-qualified crypto ----------
CREATE OR REPLACE FUNCTION public.otp_verify_challenge(
  p_user_id uuid,
  p_purpose text,
  p_otp     text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.otp_challenges%ROWTYPE;
BEGIN
  IF p_otp IS NULL OR p_otp !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('ok', false, 'error', 'Enter the 6-digit code');
  END IF;

  SELECT * INTO v_row FROM public.otp_challenges
    WHERE user_id = p_user_id AND purpose = p_purpose FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'No verification is in progress. Request a new code.');
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'This code has already been used. Request a new one.');
  END IF;

  IF v_row.expires_at < now() THEN
    UPDATE public.otp_challenges SET consumed_at = now(), updated_at = now()
      WHERE user_id = p_user_id AND purpose = p_purpose;
    RETURN json_build_object('ok', false, 'error', 'This code has expired. Request a new one.');
  END IF;

  IF v_row.attempts >= 5 THEN
    RETURN json_build_object('ok', false, 'error', 'Too many incorrect attempts. Request a new code.');
  END IF;

  IF v_row.otp_hash <> encode(extensions.digest(p_otp || ':' || v_row.salt, 'sha256'), 'hex') THEN
    UPDATE public.otp_challenges
       SET attempts = attempts + 1, updated_at = now()
     WHERE user_id = p_user_id AND purpose = p_purpose;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
    VALUES (auth.uid(), 'otp_failed', 'account', p_user_id,
            jsonb_build_object('purpose', p_purpose, 'attempts', v_row.attempts + 1));
    RETURN json_build_object(
      'ok', false,
      'error', 'Incorrect code. Please try again.',
      'attempts_left', GREATEST(0, 4 - v_row.attempts)
    );
  END IF;

  UPDATE public.otp_challenges SET consumed_at = now(), updated_at = now()
    WHERE user_id = p_user_id AND purpose = p_purpose;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'otp_verified', 'account', p_user_id,
          jsonb_build_object('purpose', p_purpose, 'channel', v_row.channel));

  RETURN json_build_object('ok', true, 'channel', v_row.channel, 'destination', v_row.destination);
END;
$$;

REVOKE ALL ON FUNCTION public.otp_verify_challenge(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.otp_verify_challenge(uuid, text, text) TO service_role;

-- ---------- generate_verification_otp: schema-qualified crypto ----------
CREATE OR REPLACE FUNCTION public.generate_verification_otp(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_email text;
  v_otp text;
  v_row public.pending_accounts%ROWTYPE;
  v_new_count integer;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  SELECT * INTO v_row FROM public.pending_accounts WHERE user_id = p_user_id FOR UPDATE;

  IF FOUND THEN
    IF v_row.resend_available_at > now() THEN
      RAISE EXCEPTION 'Please wait before requesting another code';
    END IF;
    IF v_row.attempt_count >= 5 THEN
      RAISE EXCEPTION 'Too many codes requested. Contact an administrator.';
    END IF;
  END IF;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_new_count := COALESCE(v_row.attempt_count, 0) + 1;

  INSERT INTO public.pending_accounts (user_id, email, otp_hash, expires_at, attempts, resend_available_at, attempt_count, updated_at)
  VALUES (
    p_user_id,
    v_email,
    encode(extensions.digest(v_otp, 'sha256'), 'hex'),
    now() + interval '10 minutes',
    0,
    now() + interval '60 seconds',
    v_new_count,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    otp_hash = EXCLUDED.otp_hash,
    expires_at = EXCLUDED.expires_at,
    attempts = 0,
    resend_available_at = EXCLUDED.resend_available_at,
    attempt_count = EXCLUDED.attempt_count,
    updated_at = now();

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'otp_sent', 'account', p_user_id, jsonb_build_object('email', v_email));

  RETURN json_build_object('otp', v_otp, 'email', v_email, 'expires_in', 600);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.generate_verification_otp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_verification_otp(uuid) TO service_role;

-- ---------- verify_account_otp: schema-qualified crypto ----------
CREATE OR REPLACE FUNCTION public.verify_account_otp(p_user_id uuid, p_otp text)
RETURNS json AS $$
DECLARE
  v_row public.pending_accounts%ROWTYPE;
BEGIN
  IF p_otp !~ '^[0-9]{6}$' THEN
    RETURN json_build_object('ok', false, 'error', 'Enter the 6-digit code');
  END IF;

  SELECT * INTO v_row FROM public.pending_accounts WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'No pending verification for this account');
  END IF;

  IF v_row.expires_at < now() THEN
    DELETE FROM public.pending_accounts WHERE user_id = p_user_id;
    RETURN json_build_object('ok', false, 'error', 'This code has expired. Request a new one.');
  END IF;

  IF v_row.attempts >= 5 THEN
    RETURN json_build_object('ok', false, 'error', 'Too many incorrect attempts. Request a new code.');
  END IF;

  IF v_row.otp_hash <> encode(extensions.digest(p_otp, 'sha256'), 'hex') THEN
    UPDATE public.pending_accounts SET attempts = attempts + 1, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (auth.uid(), 'otp_failed', 'account', p_user_id);
    RETURN json_build_object('ok', false, 'error', 'Incorrect code. Please try again.');
  END IF;

  UPDATE public.profiles
     SET verification_status = 'verified', is_active = true, updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.pending_accounts WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'otp_verified', 'account', p_user_id);

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.verify_account_otp(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_account_otp(uuid, text) TO service_role;
