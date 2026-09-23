/*
# Authoritative role-creation rules, self-role-change block, and role-claim sync

## Summary
Enforces one single role-creation truth table everywhere (UI + database), closes
the "change your own role" hole, and fixes the role stored in the sign-in token
for staff-created accounts.

## 1. Role-creation truth table (now enforced in the database)
- super_admin  -> may create super_admin, admin, health_worker, user
- admin        -> may create health_worker, user ONLY
- health_worker-> may create user ONLY
- user         -> may create nobody

## 2. Changes

### set_user_role(target_user_id, new_role)
- Now blocks a user from changing their OWN role (self-promotion).
- Admin may only set user/health_worker, and may only act on user/health_worker
  accounts. Any admin/super_admin target or role requires a super_admin.
- Still writes an audit record.

### toggle_user_active(target_user_id)
- A user can no longer deactivate themselves.
- Admin may not deactivate an admin or super_admin account.

### set_new_user_app_metadata()
- Previously read the role from user-supplied signup metadata, so a public
  visitor could bake 'super_admin' into their own token. It now ALWAYS writes
  'user'. Elevated roles are applied only by trusted server code.

### NEW set_user_app_metadata(p_user_id, p_role)
- Trusted helper (service_role only) that writes the role into
  auth.users.raw_app_meta_data so a newly created staff account's sign-in token
  carries the correct role. Uses the same validation as the truth table.

### admin_create_account(...)
- Rebuilt to match the truth table: health_worker is now an allowed creator but
  ONLY for the 'user' role. Rejected attempts are written to the audit log as
  'account_creation_rejected' (no secrets recorded).

## 3. Column-level protection on profiles
Row policies decide which ROWS a caller can touch, not which COLUMNS. Until now
any signed-in user could update every column of their own row, including `role`,
`is_active` and `verification_status`. This migration revokes table-wide UPDATE
and grants only the columns a user legitimately owns.

- Revoked: INSERT and DELETE (profiles are created by the signup trigger, never
  by the browser; deletion happens through auth.users cascade).
- Granted UPDATE: full_name, phone, avatar_url, barangay_id, address, city,
  date_of_birth, updated_at.
- NOT granted: role, is_active, verification_status, email, id, created_at.
  Those are only changeable through the privileged functions above.

## 4. pending_accounts
Write privileges explicitly revoked from browser roles. All writes happen inside
the SECURITY DEFINER OTP functions.

## 5. Notes
- No data is deleted or rewritten destructively.
- Existing accounts keep their current role and verification status.
*/

-- ---------- 1. set_user_role: authoritative matrix + no self-change ----------
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void AS $$
DECLARE
  caller_role text;
  target_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  IF new_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Administrators and super administrators may only be managed by a super admin,
  -- and only a super admin may grant those roles.
  IF caller_role <> 'super_admin'
     AND (new_role IN ('admin', 'super_admin') OR target_role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Unauthorized: only a super admin can manage administrator accounts';
  END IF;

  UPDATE public.profiles SET role = new_role, updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), 'role_change', 'profile', target_user_id,
          jsonb_build_object('role', target_role), jsonb_build_object('role', new_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 2. toggle_user_active: no self-deactivation, protect admins ----------
CREATE OR REPLACE FUNCTION public.toggle_user_active(target_user_id uuid)
RETURNS boolean AS $$
DECLARE
  caller_role text;
  target_role text;
  current_active boolean;
  new_active boolean;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own account status';
  END IF;

  SELECT role, is_active INTO target_role, current_active
    FROM public.profiles WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF caller_role <> 'super_admin' AND target_role IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only a super admin can manage administrator accounts';
  END IF;

  new_active := NOT current_active;

  UPDATE public.profiles SET is_active = new_active, updated_at = now() WHERE id = target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'toggle_active', 'profile', target_user_id, jsonb_build_object('is_active', new_active));

  RETURN new_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 3. Public signup can only ever be a Resident ----------
CREATE OR REPLACE FUNCTION public.set_new_user_app_metadata()
RETURNS trigger AS $$
BEGIN
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- 4. Trusted role-claim sync for staff-created accounts ----------
CREATE OR REPLACE FUNCTION public.set_user_app_metadata(p_user_id uuid, p_role text)
RETURNS void AS $$
BEGIN
  IF p_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', p_role)
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.set_user_app_metadata(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_app_metadata(uuid, text) TO service_role;

-- ---------- 5. admin_create_account: authoritative matrix ----------
CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_email text,
  p_full_name text,
  p_role text,
  p_phone text DEFAULT ''
)
RETURNS json AS $$
DECLARE
  v_caller_role text;
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('super_admin', 'admin', 'health_worker') THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'creator role not permitted', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: your role cannot create accounts';
  END IF;

  IF p_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- The authoritative role-creation matrix.
  IF v_caller_role = 'health_worker' AND p_role <> 'user' THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'health worker may only create residents', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: a health worker may only create resident accounts';
  END IF;

  IF v_caller_role = 'admin' AND p_role NOT IN ('user', 'health_worker') THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
    VALUES (v_caller_id, 'account_creation_rejected', 'account',
            jsonb_build_object('reason', 'admin may not create administrator accounts', 'requested_role', p_role));
    RAISE EXCEPTION 'Unauthorized: an admin cannot create % accounts', p_role;
  END IF;

  IF p_email IS NULL OR position('@' in p_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, new_values)
  VALUES (v_caller_id, 'account_creation_authorized', 'account',
          jsonb_build_object('email', lower(p_email), 'role', p_role, 'full_name', p_full_name));

  RETURN json_build_object('ok', true, 'email', lower(p_email), 'role', p_role, 'full_name', p_full_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_create_account(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_account(text, text, text, text) TO service_role;

-- ---------- 6. Column-level protection on profiles ----------
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, avatar_url, barangay_id, address, city, date_of_birth, updated_at)
  ON public.profiles TO authenticated;

-- ---------- 7. pending_accounts: no direct browser writes ----------
REVOKE INSERT, UPDATE, DELETE ON public.pending_accounts FROM anon, authenticated;
