/*
# Return email from resident phone lookup

get_user_by_login_id previously omitted the email for resident (phone)
lookups, preventing the edge function from signing in with email+password.
Now both staff and resident lookups return the auth email.
*/

CREATE OR REPLACE FUNCTION public.get_user_by_login_id(p_login_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile record;
BEGIN
  -- Staff: lookup by staff_id
  SELECT * INTO v_profile FROM public.profiles WHERE staff_id = p_login_id;
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'staff_id', v_profile.staff_id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  -- Resident: lookup by normalized phone
  SELECT * INTO v_profile FROM public.profiles
   WHERE public.normalize_phone(phone) = public.normalize_phone(p_login_id)
     AND role = 'user';
  IF FOUND THEN
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  RETURN json_build_object('error', 'No account found with that ID');
END;
$$;
