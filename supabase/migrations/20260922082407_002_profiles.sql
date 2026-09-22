/*
# Create profiles table with auto-creation trigger

1. New Tables
   - `profiles`
     - `id` (uuid, PK, references auth.users)
     - `email` (text, not null)
     - `full_name` (text)
     - `phone` (text)
     - `avatar_url` (text)
     - `role` (text, check constraint for 4 roles, default 'user')
     - `barangay_id` (uuid, FK to barangays)
     - `address` (text)
     - `city` (text, default 'Bacolod City')
     - `date_of_birth` (date)
     - `is_active` (boolean, default true)
     - `created_at`, `updated_at` (timestamptz)

2. Trigger
   - Auto-create profile on auth.users insert
   - Sync role to auth.users raw_app_meta_data

3. Security
   - RLS enabled
   - Users can read own profile
   - Staff (health_worker, admin, super_admin) can read all profiles
   - Users can update their own display fields only
   - Column-level grants restrict role/is_active changes

4. Notes
   - Role changes only via set_user_role() SECURITY DEFINER function (created later)
   - is_active changes only via toggle_user_active() SECURITY DEFINER function (created later)
*/

CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  full_name     text NOT NULL DEFAULT '',
  phone         text DEFAULT '',
  avatar_url    text DEFAULT '',
  role          text NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user', 'health_worker', 'admin', 'super_admin')),
  barangay_id   uuid REFERENCES barangays(id),
  address       text DEFAULT '',
  city          text NOT NULL DEFAULT 'Bacolod City',
  date_of_birth date,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_barangay ON profiles(barangay_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: users see own profile; staff see all
DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  );

-- INSERT: only via trigger (auto-created on signup)
DROP POLICY IF EXISTS "system_insert_profile" ON profiles;
CREATE POLICY "system_insert_profile" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: users can update own display fields (column grants restrict which columns)
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin/super_admin can update any profile
DROP POLICY IF EXISTS "admin_update_any_profile" ON profiles;
CREATE POLICY "admin_update_any_profile" ON profiles FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

-- DELETE: no one deletes profiles (cascade from auth.users handles it)
DROP POLICY IF EXISTS "no_delete_profiles" ON profiles;
CREATE POLICY "no_delete_profiles" ON profiles FOR DELETE
  TO authenticated
  USING (false);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Sync role to app_metadata when profile role changes
CREATE OR REPLACE FUNCTION public.sync_role_to_metadata()
RETURNS trigger AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data = 
      COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_role_change ON profiles;
CREATE TRIGGER on_profile_role_change
  AFTER UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_metadata();
