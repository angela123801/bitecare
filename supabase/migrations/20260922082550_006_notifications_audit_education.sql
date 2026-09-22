/*
# Create notifications, audit_logs, education_content, first_aid_guides tables

1. New Tables
   - `notifications` - In-app notification system
   - `audit_logs` - System audit trail (immutable)
   - `education_content` - Educational articles about rabies/bite prevention
   - `first_aid_guides` - Step-by-step first aid instructions

2. Security
   - notifications: users see only their own
   - audit_logs: insert-only for all authenticated; SELECT only admin/super_admin
   - education_content: published content readable by all; CRUD by admin+
   - first_aid_guides: published readable by all; CRUD by admin+
*/

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text NOT NULL,
  message        text NOT NULL,
  type           text NOT NULL DEFAULT 'info'
                   CHECK (type IN ('info','warning','success','error','reminder','assignment')),
  reference_type text,
  reference_id   uuid,
  is_read        boolean NOT NULL DEFAULT false,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());


-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES profiles(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "no_update_audit" ON audit_logs;
CREATE POLICY "no_update_audit" ON audit_logs FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no_delete_audit" ON audit_logs;
CREATE POLICY "no_delete_audit" ON audit_logs FOR DELETE
  TO authenticated USING (false);


-- EDUCATION CONTENT
CREATE TABLE IF NOT EXISTS education_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  slug            text NOT NULL UNIQUE,
  category        text NOT NULL DEFAULT 'general'
                    CHECK (category IN ('general','prevention','rabies','first_aid','pet_care','children_safety')),
  content         text NOT NULL,
  summary         text DEFAULT '',
  cover_image_url text DEFAULT '',
  is_published    boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  author_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE education_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_published_education" ON education_content;
CREATE POLICY "read_published_education" ON education_content FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_insert_education" ON education_content;
CREATE POLICY "admin_insert_education" ON education_content FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_update_education" ON education_content;
CREATE POLICY "admin_update_education" ON education_content FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_education" ON education_content;
CREATE POLICY "admin_delete_education" ON education_content FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));


-- FIRST AID GUIDES
CREATE TABLE IF NOT EXISTS first_aid_guides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  animal_type      text NOT NULL DEFAULT 'dog',
  wound_category   text NOT NULL DEFAULT 'II'
                     CHECK (wound_category IN ('I','II','III')),
  steps            jsonb NOT NULL DEFAULT '[]',
  warnings         jsonb NOT NULL DEFAULT '[]',
  when_to_seek_help text DEFAULT '',
  is_published     boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE first_aid_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_published_first_aid" ON first_aid_guides;
CREATE POLICY "read_published_first_aid" ON first_aid_guides FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "admin_insert_first_aid" ON first_aid_guides;
CREATE POLICY "admin_insert_first_aid" ON first_aid_guides FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_update_first_aid" ON first_aid_guides;
CREATE POLICY "admin_update_first_aid" ON first_aid_guides FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "admin_delete_first_aid" ON first_aid_guides;
CREATE POLICY "admin_delete_first_aid" ON first_aid_guides FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));
