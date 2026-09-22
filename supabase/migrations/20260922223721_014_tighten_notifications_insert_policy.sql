/*
# Tighten notifications INSERT policy

The original policy allowed ANY authenticated user to insert a notification
addressed to ANY other user (WITH CHECK (true)), which allows spoofing/phishing.
Mirror the create_notification() guard: users may only create their own
notifications; staff may notify anyone.
*/

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR get_my_role() = ANY (ARRAY['health_worker', 'admin', 'super_admin'])
  );
