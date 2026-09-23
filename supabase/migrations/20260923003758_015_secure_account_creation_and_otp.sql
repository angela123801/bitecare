/*
# Secure Account Creation with OTP Verification

## Summary
Adds a staff-driven, OTP-verified account creation system and closes a
privilege-escalation hole in the existing signup trigger.

## 1. Security Fix (critical) — role escalation via public signup
The `handle_new_user()` trigger previously read the `role` from
`raw_user_meta_data`, which ANY person can set on themselves at signup time.
That meant a self-registering visitor could choose `super_admin`. This
migration changes the trigger so public self-registration can only ever
produce a `user` (Resident). Elevated roles are assigned exclusively through
the staff-only `admin_create_account()` function below.

## 2. Modified Tables
- `profiles`
  - `email` made nullable (accounts created via the admin API may not echo the
    email back depending on provider settings).
  - New `verification_status` text, default 'verified'
    ('pending_verification' | 'verified'). Legacy rows stay 'verified' so no
    existing account is locked out. New staff-created accounts start
    'pending_verification' until the OTP is confirmed.

## 3. New Table — pending_accounts
Holds the security code (OTP) for an account awaiting verification.
  - `id` uuid PK
  - `user_id` uuid FK profiles(id), unique — the account being verified
  - `email` text — destination the code is sent to
  - `otp_hash` text — SHA-256 of the code; the plaintext is NEVER stored
  - `expires_at` timestamptz — 10 minutes after creation
  - `attempts` integer — failed attempts, capped at 5
  - `resend_available_at` timestamptz — 60 second resend cooldown
  - `attempt_count` integer — how many codes have been issued (max 5)
  - `created_at` / `updated_at`

## 4. New Functions
- `generate_verification_otp(p_user_id)` — SECURITY DEFINER. Generates a
  6-digit code, stores only its hash, returns the plaintext ONCE to the
  authorised caller (the edge function). Enforces resend cooldown + attempt cap.
- `verify_account_otp(p_user_id, p_otp)` — SECURITY DEFINER. Checks code,
  expiry and attempt count; on success marks the profile verified and deletes
  the pending row. Returns a small json result.
- `mark_account_verified(p_user_id)` — SECURITY DEFINER. Used when an account
  is created with a temporary password but verification is not required.
- `admin_create_account(...)` — SECURITY DEFINER. The ONLY path that may assign
  an elevated role. Validates the caller, enforces a strict role hierarchy
  (super_admin > admin > health_worker), prevents admin from creating admins,
  blocks health_worker entirely, rejects duplicate emails, and writes an audit log.

## 5. RLS
- `pending_accounts`: RLS enabled. Only admins/super_admins may SELECT (for
  operational visibility). No direct INSERT/UPDATE/DELETE for anyone — all
  writes happen inside the SECURITY DEFINER functions.

## 6. Audit
- Account creation, OTP issue and OTP verification are written to `audit_logs`.
  OTP values and passwords are NEVER logged.
*/

-- ---------- 1. profiles: allow pending verification state ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'verified';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_verification ON public.profiles(verification_status);

-- ---------- 2. Close the public signup role-escalation hole ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, verification_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    'verified'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 3. pending_accounts ----------
CREATE TABLE IF NOT EXISTS public.pending_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email               text NOT NULL,
  otp_hash            text NOT NULL,
  expires_at          timestamptz NOT NULL,
  attempts            integer NOT NULL DEFAULT 0,
  resend_available_at timestamptz NOT NULL DEFAULT now(),
  attempt_count       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_accounts_user ON public.pending_accounts(user_id);

ALTER TABLE public.pending_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_pending_accounts" ON public.pending_accounts;
CREATE POLICY "staff_read_pending_accounts" ON public.pending_accounts FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'super_admin'));

-- ---------- 4. OTP issue ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    encode(digest(v_otp, 'sha256'), 'hex'),
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

-- ---------- 5. OTP verify ----------
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

  IF v_row.otp_hash <> encode(digest(p_otp, 'sha256'), 'hex') THEN
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

-- ---------- 6. Direct activation (no OTP required) ----------
CREATE OR REPLACE FUNCTION public.mark_account_verified(p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
     SET verification_status = 'verified', is_active = true, updated_at = now()
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 7. The single authorised path to assign a role ----------
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

  -- Only staff may create accounts. Health workers cannot.
  IF v_caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: your role cannot create accounts';
  END IF;

  IF p_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- Health workers are creatable by both admin and super_admin.
  -- Admins and super_admins are creatable by super_admin only.
  IF v_caller_role = 'admin' AND p_role NOT IN ('user', 'health_worker') THEN
    RAISE EXCEPTION 'Unauthorized: an admin cannot create % accounts', p_role;
  END IF;

  IF p_email IS NULL OR position('@' in p_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
  VALUES (v_caller_id, 'account_creation_authorized', 'account',
          jsonb_build_object('email', lower(p_email), 'role', p_role, 'full_name', p_full_name,
                             'phone', p_phone));

  RETURN json_build_object('ok', true, 'email', lower(p_email), 'role', p_role, 'full_name', p_full_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 8. Grants ----------
REVOKE ALL ON FUNCTION public.generate_verification_otp(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_account_otp(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_account_verified(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_account(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_verification_otp(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_account_otp(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_account_verified(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_account(text, text, text, text) TO service_role;
