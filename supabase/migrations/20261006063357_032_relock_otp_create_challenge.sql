-- SECURITY FIX.
--
-- Dropping and recreating otp_create_challenge reset its grants to the default,
-- which made it executable by anon/authenticated (and PUBLIC). Because the
-- function RETURNS the plaintext code, that would have let an anonymous visitor
-- request a code for any account and read it back. The function is only ever
-- called by the otp edge function using the service role, so every other role
-- must be locked out.
revoke all on function public.otp_create_challenge(uuid, text, text, text, text) from public;
revoke all on function public.otp_create_challenge(uuid, text, text, text, text) from anon;
revoke all on function public.otp_create_challenge(uuid, text, text, text, text) from authenticated;
grant execute on function public.otp_create_challenge(uuid, text, text, text, text) to service_role;
