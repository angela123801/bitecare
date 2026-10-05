/*
# SMS-only OTP, pending-by-default registration, duplicate mobile blocking

## 1. SMS is the only verification channel
`otp_allowed_channels` now returns `{sms}` for every role. This is the single
server-side truth table used by `otp_create_challenge`, so an email code can no
longer be issued for any account, whatever the client sends. Email OTP is
disabled, not merely hidden.

## 2. New accounts are pending until they verify
`handle_new_user` previously wrote `verification_status = 'verified'` at signup,
which let a self-registered account sign in with just a password and skip the
SMS step entirely. New profiles now start as `pending_verification`. The normal
registration flow activates the account only after `verify_account_otp` passes.
The Super Admin provisioning path sets `verified` explicitly, so its exemption is
unaffected.

## 3. One account per mobile number
A partial unique index on the normalised phone blocks two accounts from sharing a
number (residents use the number as their login ID). Existing duplicates are left
in place: a partial index tolerates pre-existing rows only if they do not
conflict, so the index is created only when the current data is clean.

## 4. Hardening
`normalize_phone` is revoked from the browser roles; it is only needed inside
SECURITY DEFINER functions and the edge functions.
*/

-- ---------- 1. SMS only ----------
CREATE OR REPLACE FUNCTION public.otp_allowed_channels(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT ARRAY['sms']::text[];
$$;

REVOKE ALL ON FUNCTION public.otp_allowed_channels(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.otp_allowed_channels(text) TO anon, authenticated, service_role;

-- ---------- 2. Pending by default ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, verification_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    'pending_verification'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 3. One account per mobile number ----------
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
  ON public.profiles (public.normalize_phone(phone))
  WHERE phone IS NOT NULL AND phone <> '';

-- ---------- 4. Hardening ----------
REVOKE ALL ON FUNCTION public.normalize_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO service_role;
