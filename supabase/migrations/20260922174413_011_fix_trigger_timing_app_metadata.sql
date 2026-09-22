/*
# Fix handle_new_user trigger timing and app_metadata write

## Problem
The `handle_new_user()` trigger is AFTER INSERT, so modifying `NEW.raw_app_meta_data`
has no effect — the row is already written. The role never makes it into the JWT
`app_metadata` for new signups.

## Solution
1. Change the trigger from AFTER INSERT to BEFORE INSERT so that modifying
   `NEW.raw_app_meta_data` takes effect before the row is committed.
2. Update `handle_new_user()` to do the profile INSERT in a BEFORE trigger context.
   Since the auth.users row doesn't exist yet during BEFORE INSERT, we use
   `NEW.id` directly and rely on the profile FK being deferred or the profile
   referencing the about-to-be-created user.

## Notes
- The profile insert references `auth.users(id)` via FK. In a BEFORE INSERT trigger,
  the auth.users row doesn't exist yet, so we must do the profile insert AFTER.
  Therefore we keep AFTER INSERT for the profile creation but add a separate
  BEFORE INSERT trigger just for the app_metadata modification.
*/

-- Separate trigger just for writing role into app_metadata (BEFORE INSERT)
CREATE OR REPLACE FUNCTION public.set_new_user_app_metadata()
RETURNS trigger AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

  IF requested_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    requested_role := 'user';
  END IF;

  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', requested_role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_set_metadata ON auth.users;
CREATE TRIGGER on_auth_user_set_metadata
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_new_user_app_metadata();

-- Revert handle_new_user to just do the profile insert (keep as AFTER INSERT)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

  IF requested_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    requested_role := 'user';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    requested_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
