-- Hygiene: the public registration function only ever acts on a signed-in
-- account (it raises 'Unauthorized' when auth.uid() is null), so the anonymous
-- role has no reason to hold EXECUTE on it. Remove that grant explicitly.
revoke execute on function public.public_complete_registration(text, text, uuid, text) from anon;

-- Pin the search_path on the phone normaliser, which the registration and
-- account-creation paths both rely on.
alter function public.normalize_phone(text) set search_path = public;
