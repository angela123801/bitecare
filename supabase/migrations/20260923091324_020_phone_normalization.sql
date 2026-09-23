/*
# Phone number normalization for resident login

Residents log in with their phone number, so the same number must match
regardless of how it is typed (e.g. 09701999817 vs +639701999817 vs
639701999817 vs 0970-199-9817). Normalize both at storage time and at
lookup time so a resident cannot be locked out or duplicated by formatting.
*/

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    ELSE regexp_replace(
      CASE
        WHEN p_phone ~ '^\+63' THEN '0' || substr(p_phone, 4)
        WHEN p_phone ~ '^63'   THEN '0' || substr(p_phone, 3)
        ELSE p_phone
      END,
      '[^0-9]', '', 'g'
    )
  END;
$$;

-- Lookup by normalized phone so formatting differences still match.
CREATE OR REPLACE FUNCTION public.get_user_by_login_id(p_login_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE staff_id = p_login_id;
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'staff_id', v_profile.staff_id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles
   WHERE public.normalize_phone(phone) = public.normalize_phone(p_login_id)
     AND role = 'user';
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone
    );
  END IF;

  RETURN json_build_object('error', 'No account found with that ID');
END;
$$;

-- Normalize the phone number when a resident completes registration.
CREATE OR REPLACE FUNCTION public.public_complete_registration(
  p_role text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT '',
  p_barangay_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role_done timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_open_registration_enabled() THEN
    RAISE EXCEPTION 'Open registration is not enabled';
  END IF;

  IF p_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role_selected_at INTO v_role_done FROM public.profiles WHERE id = v_uid;

  IF v_role_done IS NOT NULL THEN
    RAISE EXCEPTION 'A role has already been set for this account';
  END IF;

  UPDATE public.profiles
     SET role = p_role,
         full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
         phone = COALESCE(public.normalize_phone(NULLIF(p_phone, '')), phone),
         barangay_id = COALESCE(p_barangay_id, barangay_id),
         role_selected_at = now(),
         updated_at = now()
   WHERE id = v_uid;

  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('role', p_role)
   WHERE id = v_uid;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (v_uid, 'account_role_selected', 'account', v_uid, jsonb_build_object('role', p_role));

  RETURN json_build_object('ok', true, 'role', p_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
