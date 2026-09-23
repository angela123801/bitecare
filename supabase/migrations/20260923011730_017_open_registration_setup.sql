/*
# Open public registration (presentation/setup stage) with a kill switch

## Summary
The project team needs to create the four initial beneficiary/presentation
accounts through the public registration page, choosing the role openly. This
migration enables that, while keeping a single switch that can close it again
later, and while preserving the rule that a person cannot change their own role
afterwards.

## 1. New Table — app_settings
Simple key/value settings store.
  - `key` text primary key
  - `value` jsonb
  - `updated_at` timestamptz
Seeded with `open_registration = { "enabled": true }`.

Security: readable by anon + authenticated (the registration page needs to know
whether to show the open role picker), no browser writes.

## 2. New Function — is_open_registration_enabled()
Returns whether open role selection is currently allowed at registration.
Readable by anon and authenticated; it exposes only a true/false flag.

## 3. New Column — profiles.role_selected_at
Marks when a new registrant chose their role at sign-up. Existing accounts are
backfilled with the current time, so they are treated as already finalised.

## 4. New Function — public_complete_registration(role, full_name, phone, barangay)
The one-time registration step. A newly registered person calls this once to
record the role they selected.
  - Only runs while open registration is enabled.
  - Only runs ONCE per account (rejected if `role_selected_at` is already set),
    so a signed-in user cannot use it to change their own role later.
  - Validates the role against the four valid roles.
  - Writes the role to the profile AND to the sign-in token's app_metadata, so
    the very next session carries the correct role.
  - Records an audit entry. No secrets are logged.

## 5. Notes
- This is the deliberate, documented exception for the setup/presentation stage.
- To close public role selection later, run:
    UPDATE app_settings SET value = '{"enabled": false}'::jsonb
    WHERE key = 'open_registration';
  After that, public registration creates Resident accounts only, and the
  registration page automatically shows a locked role field.
- Authenticated in-app account creation still obeys the strict role matrix from
  the previous migration and is unaffected by this switch.
*/

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_app_settings" ON public.app_settings;
CREATE POLICY "read_app_settings" ON public.app_settings FOR SELECT
  TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;

INSERT INTO public.app_settings (key, value)
VALUES ('open_registration', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_open_registration_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key = 'open_registration'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_open_registration_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_open_registration_enabled() TO anon, authenticated;

-- ---------- one-time role selection at registration ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_selected_at timestamptz;

-- Existing accounts are already finalised; they must not use the registration step.
UPDATE public.profiles SET role_selected_at = now() WHERE role_selected_at IS NULL;

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
         phone = COALESCE(NULLIF(p_phone, ''), phone),
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

REVOKE ALL ON FUNCTION public.public_complete_registration(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_complete_registration(text, text, text, uuid) TO authenticated;
