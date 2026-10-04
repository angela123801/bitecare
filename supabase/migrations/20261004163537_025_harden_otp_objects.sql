/*
# Harden the new OTP objects

## Summary
Two small hardening changes to the OTP objects introduced in migration 023.

## 1. otp_challenges — explicit deny-by-default policy
RLS is enabled and all grants are revoked from the browser roles, so the table
is already unreachable. This adds an explicit deny policy so the intent is
recorded in the schema (and the security linter stops flagging the table).
Only the SECURITY DEFINER OTP functions, which run as the table owner, touch it.

## 2. otp_allowed_channels — fixed search path
Pins the function's search_path. The function returns a constant array and
reads no tables, so there is no behaviour change; it just removes a mutable
search_path warning.
*/

DROP POLICY IF EXISTS "deny_all_otp_challenges" ON public.otp_challenges;
CREATE POLICY "deny_all_otp_challenges" ON public.otp_challenges FOR ALL
  TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.otp_allowed_channels(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_role = 'user' THEN ARRAY['sms']::text[]
    ELSE ARRAY['email','sms']::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.otp_allowed_channels(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.otp_allowed_channels(text) TO anon, authenticated, service_role;
