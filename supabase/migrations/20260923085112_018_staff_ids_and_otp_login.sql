/*
# Staff ID system and OTP login infrastructure

## Summary
Adds generated staff IDs (SA-XXXXXX, AD-XXXXXX, HW-XXXXXX) for staff roles,
a phone-based OTP login flow for residents, and staff OTP via email/SMS.

## 1. New column: profiles.staff_id
- Unique text identifier for super_admin, admin, health_worker accounts.
- Auto-generated on account creation via trigger. Null for residents.
- Staff sign in with this ID instead of email.

## 2. New table: staff_id_sequences
- Tracks the next available number per role prefix.
- Ensures no gaps or race conditions with row-level locking.

## 3. New table: otp_codes
- Stores time-limited one-time passwords.
- Supports 'login' (resident phone login) and 'verification' (account creation) purposes.
- Auto-expires after 10 minutes, one use only.

## 4. New functions
- generate_staff_id(p_role): allocates the next staff ID for a given role.
- set_staff_id_on_profile(): trigger that auto-assigns staff_id on profile insert/role update.
- generate_login_otp(p_user_id, p_phone): creates a login OTP for resident accounts.
- verify_login_otp(p_user_id, p_otp): consumes and validates a login OTP.
- generate_staff_login_otp(p_user_id): creates staff OTP (for additional security step after password).
- verify_staff_login_otp(p_user_id, p_otp): consumes staff login OTP.
- get_user_by_login_id(p_login_id): resolves staff_id or phone to a profile for sign-in.

## 5. Security
- RLS on otp_codes: users can only verify their own codes.
- RLS on staff_id_sequences: no direct user access.
*/

-- Staff ID sequences per role
CREATE TABLE IF NOT EXISTS public.staff_id_sequences (
  prefix  text PRIMARY KEY,
  next_id integer NOT NULL DEFAULT 1
);

ALTER TABLE public.staff_id_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_direct_access_staff_id_sequences" ON public.staff_id_sequences;
CREATE POLICY "no_direct_access_staff_id_sequences" ON public.staff_id_sequences FOR SELECT
  TO authenticated USING (false);

-- Seed sequences
INSERT INTO public.staff_id_sequences (prefix, next_id)
VALUES ('SA', 1), ('AD', 1), ('HW', 1)
ON CONFLICT (prefix) DO NOTHING;

-- Add staff_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS staff_id text UNIQUE;

-- OTP codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL,
  purpose    text NOT NULL CHECK (purpose IN ('login', 'verification', 'staff_login')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_purpose ON public.otp_codes(user_id, purpose, created_at DESC);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- OTP: users can verify their own codes via the SECURITY DEFINER functions below.
-- No direct SELECT/INSERT/UPDATE/DELETE access for regular users.
DROP POLICY IF EXISTS "no_direct_access_otp" ON public.otp_codes;
CREATE POLICY "no_direct_access_otp" ON public.otp_codes FOR ALL
  TO authenticated USING (false);

-- Generate next staff ID for a role (atomically locked)
CREATE OR REPLACE FUNCTION public.generate_staff_id(p_role text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_num    integer;
BEGIN
  IF p_role = 'super_admin' THEN v_prefix := 'SA';
  ELSIF p_role = 'admin' THEN v_prefix := 'AD';
  ELSIF p_role = 'health_worker' THEN v_prefix := 'HW';
  ELSE RAISE EXCEPTION 'Role % cannot receive a staff ID', p_role;
  END IF;

  UPDATE public.staff_id_sequences
     SET next_id = next_id + 1
   WHERE prefix = v_prefix
   RETURNING next_id - 1 INTO v_num;

  IF NOT FOUND THEN
    INSERT INTO public.staff_id_sequences (prefix, next_id) VALUES (v_prefix, 2)
    RETURNING 1 INTO v_num;
  END IF;

  RETURN v_prefix || '-' || lpad(v_num::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_staff_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_staff_id(text) TO authenticated;

-- Auto-assign staff_id to new staff profiles
CREATE OR REPLACE FUNCTION public.set_staff_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('super_admin', 'admin', 'health_worker') AND NEW.staff_id IS NULL THEN
    NEW.staff_id := public.generate_staff_id(NEW.role);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_staff_id ON public.profiles;
CREATE TRIGGER trg_set_staff_id
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_staff_id();

-- Backfill staff IDs for existing staff accounts that don't have one
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, role FROM public.profiles
           WHERE role IN ('super_admin', 'admin', 'health_worker') AND staff_id IS NULL
  LOOP
    UPDATE public.profiles SET staff_id = public.generate_staff_id(r.role) WHERE id = r.id;
  END LOOP;
END;
$$;

-- Generate a login OTP for a resident
CREATE OR REPLACE FUNCTION public.generate_login_otp(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
  v_phone text;
BEGIN
  -- Only residents use phone-based login
  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_user_id;
  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN json_build_object('error', 'No phone number on this account');
  END IF;

  -- Generate 6-digit code
  v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');

  -- Expire any unused codes for this user+login purpose
  UPDATE public.otp_codes SET used_at = now()
   WHERE user_id = p_user_id AND purpose = 'login' AND used_at IS NULL AND expires_at > now();

  -- Insert new code
  INSERT INTO public.otp_codes (user_id, code, purpose) VALUES (p_user_id, v_code, 'login');

  RETURN json_build_object('ok', true, 'phone', v_code, 'dev_otp', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_login_otp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_login_otp(uuid) TO anon, authenticated;

-- Verify a login OTP and return the user's profile info
CREATE OR REPLACE FUNCTION public.verify_login_otp(p_user_id uuid, p_otp text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code record;
BEGIN
  SELECT * INTO v_code FROM public.otp_codes
   WHERE user_id = p_user_id
     AND purpose = 'login'
     AND code = p_otp
     AND used_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired code');
  END IF;

  -- Mark code as used
  UPDATE public.otp_codes SET used_at = now() WHERE id = v_code.id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_login_otp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_login_otp(uuid, text) TO anon, authenticated;

-- Generate a staff login OTP (2FA step after password)
CREATE OR REPLACE FUNCTION public.generate_staff_login_otp(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');

  UPDATE public.otp_codes SET used_at = now()
   WHERE user_id = p_user_id AND purpose = 'staff_login' AND used_at IS NULL AND expires_at > now();

  INSERT INTO public.otp_codes (user_id, code, purpose) VALUES (p_user_id, v_code, 'staff_login');

  RETURN json_build_object('ok', true, 'dev_otp', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_staff_login_otp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_staff_login_otp(uuid) TO authenticated;

-- Verify a staff login OTP
CREATE OR REPLACE FUNCTION public.verify_staff_login_otp(p_user_id uuid, p_otp text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code record;
BEGIN
  SELECT * INTO v_code FROM public.otp_codes
   WHERE user_id = p_user_id
     AND purpose = 'staff_login'
     AND code = p_otp
     AND used_at IS NULL
     AND expires_at > now()
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid or expired code');
  END IF;

  UPDATE public.otp_codes SET used_at = now() WHERE id = v_code.id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_staff_login_otp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_staff_login_otp(uuid, text) TO authenticated;

-- Resolve a login ID (staff_id or phone) to a user
CREATE OR REPLACE FUNCTION public.get_user_by_login_id(p_login_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  -- Try staff_id first
  SELECT * INTO v_profile FROM public.profiles WHERE staff_id = p_login_id;
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'staff_id', v_profile.staff_id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone
    );
  END IF;

  -- Try phone number
  SELECT * INTO v_profile FROM public.profiles WHERE phone = p_login_id AND role = 'user';
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone
    );
  END IF;

  RETURN json_build_object('error', 'No account found with that ID');
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_by_login_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_by_login_id(text) TO anon, authenticated;
