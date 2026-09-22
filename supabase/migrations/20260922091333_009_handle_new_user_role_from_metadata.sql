/*
# Update handle_new_user trigger to accept role from signup metadata

1. Modified Functions
   - `handle_new_user()` — now reads `role` from `raw_user_meta_data` in addition to `full_name`.
     If the role value is one of the four valid roles ('user', 'health_worker', 'admin', 'super_admin'),
     it is used; otherwise defaults to 'user'.

2. Security Notes
   - The trigger still runs as SECURITY DEFINER (required for auth.users trigger).
   - Role is validated against the CHECK constraint on profiles.role.
   - This allows account creation to specify a role at signup time.
*/

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
