/*
# Fix Super Admin account creation + harden account-creation OTP

## Summary
Two related fixes. First, the actual root cause of "the Super Admin cannot
create any role". Second, hardening of the account-creation verification code so
it is no longer generated with a predictable generator and is stored salted.

## 1. Root cause of the account-creation failure (critical)
`admin_create_account(...)` is the database function that authorises a role and
records the audit trail. A later migration (`..._023_secure_otp_system`) revoked
its EXECUTE grant from `authenticated` and granted it to `service_role` only.

The account-admin edge function, however, calls this function as the SIGNED-IN
user (so `auth.uid()` is the caller and the role rules can be evaluated). As a
result every call failed with "permission denied for function
admin_create_account" — so no role could ever be created, by anyone.

Fix: grant EXECUTE back to `authenticated`. This does NOT widen what a role may
create: the function still validates the caller's role and the creation matrix
internally, and it still cannot be reached by `anon`.

## 2. Duplicate login identifier (residents)
`admin_create_account` now also rejects creating a second Resident account with
a mobile number that is already registered, since a resident's mobile number IS
their login identifier. Comparison is done through `normalize_phone` so
formatting differences (09…, +639…, 639…) still collide.

## 3. Hardened account-creation OTP
- `pending_accounts` gains a per-row `salt` column.
- `generate_verification_otp` now generates the code with
  `extensions.gen_random_bytes` (cryptographically random) instead of
  `floor(random() * 1000000)`, and stores `sha256(code || ':' || salt)` — the
  plaintext code is never stored.
- `verify_account_otp` compares against the salted hash.
- Expiry (10 minutes), attempt cap (5) and the 60-second resend cooldown with a
  5-code cap are unchanged and still enforced.

## 4. Notes
- No data is deleted. Existing profiles are untouched.
- In-flight account-creation codes (if any) are invalidated by the new hash
  format and can simply be re-requested.
*/

-- ---------- 1. Root-cause fix: signed-in staff may authorise role creation ----------
GRANT EXECUTE ON FUNCTION public.admin_create_account(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_account(text, text, text, text) TO service_role;

-- ---------- 2. Salted storage for the account-creation code ----------
ALTER TABLE public.pending_accounts ADD COLUMN IF NOT EXISTS salt text;

-- ---------- 3. admin_create_account: add duplicate-mobile guard ----------
CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_email text,
  p_full_name text,
  p_role text,
  p_phone text DEFAULT ''
)
RETURNS json AS $$
DECLARE
  v_caller_role text;
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('super_admin', 'admin', 'health_worker') THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'creator role not permitted', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: your role cannot create accounts';
  END IF;

  IF p_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- The authoritative role-creation matrix.
  IF v_caller_role = 'health_worker' AND p_role <> 'user' THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'health worker may only create residents', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: a health worker may only create resident accounts';
  END IF;

  IF v_caller_role = 'admin' AND p_role NOT IN ('user', 'health_worker') THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'admin may not create administrator accounts', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: an admin cannot create % accounts', p_role;
  END IF;

  IF p_email IS NULL OR position('@' in p_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  -- A resident's mobile number is their login identifier, so it must be unique.
  IF p_role = 'user' AND COALESCE(p_phone, '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE role = 'user'
        AND public.normalize_phone(phone) = public.normalize_phone(p_phone)
    ) THEN
      RAISE EXCEPTION 'An account with this mobile number already exists';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
  VALUES (v_caller_id, 'account_creation_authorized', 'account',
          jsonb_build_object('email', lower(p_email), 'role', p_role, 'full_name', p_full_name));

  RETURN json_build_object('ok', true, 'email', lower(p_email), 'role', p_role, 'full_name', p_full_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_create_account(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_account(text, text, text, text) TO authenticated, service_role;

-- ---------- 4. generate_verification_otp: salted hash + cryptographic code ----------
CREATE OR REPLACE FUNCTION public.generate_verification_otp(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_email text;
  v_otp text;
  v_salt text;
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

  v_otp := lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text,
    6, '0'
  );
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');
  v_new_count := COALESCE(v_row.attempt_count, 0) + 1;

  INSERT INTO public.pending_accounts (user_id, email, otp_hash, salt, expires_at, attempts, resend_available_at, attempt_count, updated_at)
  VALUES (
    p_user_id,
    v_email,
    encode(extensions.digest(v_otp || ':' || v_salt, 'sha256'), 'hex'),
    v_salt,
    now() + interval '10 minutes',
    0,
    now() + interval '60 seconds',
    v_new_count,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    otp_hash = EXCLUDED.otp_hash,
    salt = EXCLUDED.salt,
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

-- ---------- 5. verify_account_otp: salted hash comparison ----------
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

  IF v_row.salt IS NULL
     OR v_row.otp_hash <> encode(extensions.digest(p_otp || ':' || v_row.salt, 'sha256'), 'hex') THEN
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
