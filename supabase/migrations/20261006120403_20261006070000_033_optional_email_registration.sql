/*
# Optional email for resident self-registration

## 1. Why
Residents may now register with only the required details and verify by SMS.
Email becomes optional: a blank email is stored as NULL rather than a made-up
address, and sign-in keeps working because residents sign in with their mobile
number.

## 2. What changes

### handle_new_user
- A signup that carried no email now writes a NULL profile email instead of an
  empty string.
- The internal sign-in address described below is never written to the profile,
  so no account ever displays a fake email.

### get_user_by_login_id
- Now returns `auth_email` in addition to `email`.
  - `email` is the public address shown in the app, which may now be NULL.
  - `auth_email` is the address the auth server knows for the account.
- Sign-in and password reset use `auth_email`; the screens use `email`.

## 3. Internal sign-in address
Supabase Auth identifies every account by an email. A resident who supplies none
is given `<mobile digits>@phone.bitecare.local` internally. That domain is
reserved for this purpose, is never emailed (SMS is the only verification
channel), and is hidden from every screen. It exists only so the account can
authenticate, and it is never stored on the profile.

## 4. Notes
- No columns are dropped or renamed; existing accounts and their emails are
  untouched.
- `profiles.email` was already nullable, so no table change is required.
- SMS OTP remains the only verification method and is unchanged.
*/

-- ---------- 1. Profiles: keep a missing email as NULL ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_email text;
BEGIN
  v_email := nullif(btrim(coalesce(NEW.email, '')), '');
  IF v_email IS NOT NULL AND lower(v_email) LIKE '%@phone.bitecare.local' THEN
    v_email := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, verification_status)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'user',
    'pending_verification'
  );
  RETURN NEW;
END;
$function$;

-- ---------- 2. Login lookup: expose the auth address separately ----------
CREATE OR REPLACE FUNCTION public.get_user_by_login_id(p_login_id text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile record;
  v_auth_email text;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE staff_id = p_login_id;
  IF FOUND THEN
    SELECT u.email INTO v_auth_email FROM auth.users u WHERE u.id = v_profile.id;
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'auth_email', v_auth_email,
      'staff_id', v_profile.staff_id,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  SELECT * INTO v_profile FROM public.profiles
   WHERE public.normalize_phone(phone) = public.normalize_phone(p_login_id)
     AND role = 'user';
  IF FOUND THEN
    SELECT u.email INTO v_auth_email FROM auth.users u WHERE u.id = v_profile.id;
    RETURN json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'auth_email', v_auth_email,
      'role', v_profile.role,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'is_active', v_profile.is_active
    );
  END IF;

  RETURN json_build_object('error', 'No account found with that ID');
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_by_login_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_login_id(text) TO service_role;
