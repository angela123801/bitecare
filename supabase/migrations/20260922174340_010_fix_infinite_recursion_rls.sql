/*
# Fix infinite recursion in RLS policies

## Problem
All RLS policies that check the caller's role do so via
  `(SELECT role FROM profiles WHERE id = auth.uid())`
This causes infinite recursion on the `profiles` table itself, because
evaluating the SELECT policy on profiles requires evaluating the same
subquery, which triggers the same policy check, ad infinitum.

## Solution
1. Create a `get_my_role()` SECURITY DEFINER function that reads the role
   from `auth.jwt()->'app_metadata'->>'role'` — this reads the JWT claim
   directly with no table access, breaking the recursion.
2. Update `handle_new_user()` to also write the role into
   `raw_app_meta_data` so the JWT carries the role from the first session.
3. Replace every `(SELECT role FROM profiles WHERE id = auth.uid())`
   in all RLS policies across all tables (including storage.objects)
   with `get_my_role()`.

## Affected Tables (24 policies across 10 tables)
- profiles
- bite_reports
- bite_report_photos
- bite_report_status_history
- vaccination_records
- audit_logs
- education_content
- first_aid_guides
- healthcare_facilities
- storage.objects

## Security Notes
- `get_my_role()` is SECURITY DEFINER but only reads the JWT, not any table.
- `raw_app_meta_data` is user-immutable (only server/triggers can write it).
- The `sync_role_to_metadata` trigger already updates `raw_app_meta_data`
  when the profile role changes, keeping the JWT in sync after role changes.
- Existing users who signed up before this fix need their app_metadata
  backfilled — a one-time UPDATE is included.
*/

-- 1. Create get_my_role() helper
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    auth.jwt()->'app_metadata'->>'role',
    'user'
  );
$$;

-- 2. Update handle_new_user() to write role into raw_app_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

  IF requested_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    requested_role := 'user';
  END IF;

  -- Write role to app_metadata so the JWT carries it immediately
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', requested_role);

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

-- 3. Backfill app_metadata for any existing users missing the role claim
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id, p.role
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.raw_app_meta_data->>'role' IS NULL
       OR u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', r.role)
    WHERE id = r.id;
  END LOOP;
END $$;

-- ============================================================
-- 4. Replace all RLS policies that subselect from profiles
-- ============================================================

-- === profiles ===

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_update_any_profile" ON profiles;
CREATE POLICY "admin_update_any_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

-- === healthcare_facilities ===

DROP POLICY IF EXISTS "read_active_facilities" ON healthcare_facilities;
CREATE POLICY "read_active_facilities" ON healthcare_facilities FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR get_my_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_insert_facilities" ON healthcare_facilities;
CREATE POLICY "admin_insert_facilities" ON healthcare_facilities FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_update_facilities" ON healthcare_facilities;
CREATE POLICY "admin_update_facilities" ON healthcare_facilities FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_facilities" ON healthcare_facilities;
CREATE POLICY "admin_delete_facilities" ON healthcare_facilities FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === bite_reports ===

DROP POLICY IF EXISTS "select_bite_reports" ON bite_reports;
CREATE POLICY "select_bite_reports" ON bite_reports FOR SELECT
  TO authenticated
  USING (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS "update_own_bite_reports" ON bite_reports;
CREATE POLICY "update_own_bite_reports" ON bite_reports FOR UPDATE
  TO authenticated
  USING (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
  )
  WITH CHECK (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS "delete_bite_reports" ON bite_reports;
CREATE POLICY "delete_bite_reports" ON bite_reports FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === bite_report_photos ===

DROP POLICY IF EXISTS "select_report_photos" ON bite_report_photos;
CREATE POLICY "select_report_photos" ON bite_report_photos FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_report_photos" ON bite_report_photos;
CREATE POLICY "delete_report_photos" ON bite_report_photos FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR get_my_role() IN ('admin', 'super_admin')
  );

-- === bite_report_status_history ===

DROP POLICY IF EXISTS "select_status_history" ON bite_report_status_history;
CREATE POLICY "select_status_history" ON bite_report_status_history FOR SELECT
  TO authenticated
  USING (
    changed_by = auth.uid()
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
  );

-- === vaccination_records ===

DROP POLICY IF EXISTS "select_vaccination_records" ON vaccination_records;
CREATE POLICY "select_vaccination_records" ON vaccination_records FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR administered_by = auth.uid()
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
    OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS "staff_insert_vaccination" ON vaccination_records;
CREATE POLICY "staff_insert_vaccination" ON vaccination_records FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('health_worker', 'admin', 'super_admin'));

DROP POLICY IF EXISTS "staff_update_vaccination" ON vaccination_records;
CREATE POLICY "staff_update_vaccination" ON vaccination_records FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('health_worker', 'admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('health_worker', 'admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_vaccination" ON vaccination_records;
CREATE POLICY "admin_delete_vaccination" ON vaccination_records FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === audit_logs ===

DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === education_content ===

DROP POLICY IF EXISTS "read_published_education" ON education_content;
CREATE POLICY "read_published_education" ON education_content FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR get_my_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_insert_education" ON education_content;
CREATE POLICY "admin_insert_education" ON education_content FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_update_education" ON education_content;
CREATE POLICY "admin_update_education" ON education_content FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_education" ON education_content;
CREATE POLICY "admin_delete_education" ON education_content FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === first_aid_guides ===

DROP POLICY IF EXISTS "read_published_first_aid" ON first_aid_guides;
CREATE POLICY "read_published_first_aid" ON first_aid_guides FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR get_my_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_insert_first_aid" ON first_aid_guides;
CREATE POLICY "admin_insert_first_aid" ON first_aid_guides FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_update_first_aid" ON first_aid_guides;
CREATE POLICY "admin_update_first_aid" ON first_aid_guides FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'))
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_first_aid" ON first_aid_guides;
CREATE POLICY "admin_delete_first_aid" ON first_aid_guides FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- === storage.objects (bite-photos) ===

DROP POLICY IF EXISTS "bite_photo_select" ON storage.objects;
CREATE POLICY "bite_photo_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bite-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR get_my_role() IN ('health_worker', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "bite_photo_delete" ON storage.objects;
CREATE POLICY "bite_photo_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bite-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR get_my_role() IN ('admin', 'super_admin')
    )
  );
