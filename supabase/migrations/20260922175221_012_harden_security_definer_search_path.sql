/*
# Harden SECURITY DEFINER functions with immutable search_path

## Problem
All SECURITY DEFINER functions have a mutable search_path, which is a
security risk — a malicious user could manipulate the search_path to
redirect function calls to attacker-controlled schemas.

## Solution
Recreate all SECURITY DEFINER functions with SET search_path = '' (empty),
using fully-qualified references (public.*, auth.*) inside the function body.

## Affected Functions
- public.get_my_role()
- public.set_new_user_app_metadata()
- public.handle_new_user()
- public.sync_role_to_metadata()
- public.set_user_role()
- public.toggle_user_active()
- public.update_report_status()
- public.create_notification()
- public.check_super_admin_exists()
- public.initialize_super_admin()

## Security Notes
- SET search_path = '' prevents search_path manipulation attacks
- All table references now fully qualified with schema prefix
*/

-- get_my_role: reads from JWT, no table access
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    auth.jwt()->'app_metadata'->>'role',
    'user'
  );
$$;

-- set_new_user_app_metadata: BEFORE INSERT on auth.users
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- handle_new_user: AFTER INSERT on auth.users — creates profile
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- sync_role_to_metadata: AFTER UPDATE on profiles.role
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- set_user_role: admin/super_admin only
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  IF new_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  IF new_role IN ('super_admin', 'admin') AND caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only super admin can assign this role';
  END IF;

  UPDATE public.profiles SET role = new_role, updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'role_change', 'profile', target_user_id, jsonb_build_object('role', new_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- toggle_user_active: admin/super_admin only
CREATE OR REPLACE FUNCTION public.toggle_user_active(target_user_id uuid)
RETURNS boolean AS $$
DECLARE
  caller_role text;
  current_active boolean;
  new_active boolean;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  SELECT is_active INTO current_active FROM public.profiles WHERE id = target_user_id;
  new_active := NOT current_active;

  UPDATE public.profiles SET is_active = new_active, updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'toggle_active', 'profile', target_user_id, jsonb_build_object('is_active', new_active));

  RETURN new_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- update_report_status: health_worker/admin/super_admin
CREATE OR REPLACE FUNCTION public.update_report_status(
  p_report_id uuid,
  p_new_status text,
  p_notes text DEFAULT ''
)
RETURNS void AS $$
DECLARE
  caller_role text;
  old_status text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  SELECT status INTO old_status FROM public.bite_reports WHERE id = p_report_id;

  IF old_status IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  UPDATE public.bite_reports
  SET status = p_new_status, updated_at = now(),
      closed_at = CASE WHEN p_new_status IN ('closed', 'treatment_completed') THEN now() ELSE closed_at END
  WHERE id = p_report_id;

  INSERT INTO public.bite_report_status_history (report_id, from_status, to_status, changed_by, notes)
  VALUES (p_report_id, old_status, p_new_status, auth.uid(), p_notes);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), 'status_change', 'bite_report', p_report_id,
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', p_new_status, 'notes', p_notes));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- create_notification helper
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text DEFAULT 'info',
  p_ref_type text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  notif_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (p_user_id, p_title, p_message, p_type, p_ref_type, p_ref_id)
  RETURNING id INTO notif_id;

  RETURN notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- check_super_admin_exists
CREATE OR REPLACE FUNCTION public.check_super_admin_exists()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- initialize_super_admin
CREATE OR REPLACE FUNCTION public.initialize_super_admin(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Super admin already exists';
  END IF;

  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Can only initialize your own account';
  END IF;

  UPDATE public.profiles SET role = 'super_admin', updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'initialize_super_admin', 'profile', target_user_id, jsonb_build_object('role', 'super_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
