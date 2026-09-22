/*
# Harden SECURITY DEFINER function execution

Addresses advisor lint 0028 (anon-executable SECURITY DEFINER functions).

- Revoke EXECUTE from PUBLIC/anon on RPC functions the app calls while signed in.
- Revoke ALL from anon/authenticated on trigger-only functions (they run as the table owner).
- Grant EXECUTE to authenticated on the RPC functions the client legitimately calls.
- Add a caller check to create_notification so non-staff cannot notify arbitrary users.
*/

-- ---- RPC functions called by the client (authenticated) ----
REVOKE EXECUTE ON FUNCTION public.check_super_admin_exists() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.initialize_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_user_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_report_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_super_admin_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_user_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_report_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ---- Trigger-only functions: not callable over the API ----
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_new_user_app_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_role_to_metadata() FROM PUBLIC, anon, authenticated;

-- ---- create_notification: only staff may notify other users ----
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
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();

  -- Staff can notify anyone; everyone else can only create their own notifications.
  IF caller_role NOT IN ('health_worker', 'admin', 'super_admin') AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot create notifications for other users';
  END IF;

  INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (p_user_id, p_title, p_message, p_type, p_ref_type, p_ref_id)
  RETURNING id INTO notif_id;

  RETURN notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
