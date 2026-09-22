/*
# Create security functions and storage buckets

1. Security Functions (SECURITY DEFINER)
   - `set_user_role(target_user_id, new_role)` - Only admin/super_admin can call
   - `toggle_user_active(target_user_id)` - Only admin/super_admin can call
   - `update_report_status(report_id, new_status, notes)` - Health worker/admin/super_admin
   - `create_notification(target_user_id, title, message, type, ref_type, ref_id)` - Any authenticated

2. Storage
   - Create `avatars` bucket (private)
   - Create `bite-photos` bucket (private)
   - Storage policies for owner-scoped access

3. Notes
   - These functions bypass RLS to perform privileged operations
   - They check the caller's role internally before executing
   - This prevents privilege escalation via direct table updates
*/

-- Set user role (admin/super_admin only)
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  
  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;
  
  IF new_role NOT IN ('user', 'health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  
  -- Only super_admin can assign super_admin or admin roles
  IF new_role IN ('super_admin', 'admin') AND caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only super admin can assign this role';
  END IF;
  
  UPDATE profiles SET role = new_role, updated_at = now() WHERE id = target_user_id;
  
  -- Audit log
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'role_change', 'profile', target_user_id, jsonb_build_object('role', new_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle user active status (admin/super_admin only)
CREATE OR REPLACE FUNCTION public.toggle_user_active(target_user_id uuid)
RETURNS boolean AS $$
DECLARE
  caller_role text;
  current_active boolean;
  new_active boolean;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  
  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;
  
  SELECT is_active INTO current_active FROM profiles WHERE id = target_user_id;
  new_active := NOT current_active;
  
  UPDATE profiles SET is_active = new_active, updated_at = now() WHERE id = target_user_id;
  
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'toggle_active', 'profile', target_user_id, jsonb_build_object('is_active', new_active));
  
  RETURN new_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update report status with history tracking
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
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  
  IF caller_role NOT IN ('health_worker', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;
  
  SELECT status INTO old_status FROM bite_reports WHERE id = p_report_id;
  
  IF old_status IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  
  UPDATE bite_reports 
  SET status = p_new_status, updated_at = now(),
      closed_at = CASE WHEN p_new_status IN ('closed', 'treatment_completed') THEN now() ELSE closed_at END
  WHERE id = p_report_id;
  
  INSERT INTO bite_report_status_history (report_id, from_status, to_status, changed_by, notes)
  VALUES (p_report_id, old_status, p_new_status, auth.uid(), p_notes);
  
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), 'status_change', 'bite_report', p_report_id,
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', p_new_status, 'notes', p_notes));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification helper
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
  INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (p_user_id, p_title, p_message, p_type, p_ref_type, p_ref_id)
  RETURNING id INTO notif_id;
  
  RETURN notif_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if any super_admin exists (for first-time setup)
CREATE OR REPLACE FUNCTION public.check_super_admin_exists()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM profiles WHERE role = 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize first super admin (only works if none exist)
CREATE OR REPLACE FUNCTION public.initialize_super_admin(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Super admin already exists';
  END IF;
  
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Can only initialize your own account';
  END IF;
  
  UPDATE profiles SET role = 'super_admin', updated_at = now() WHERE id = target_user_id;
  
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, new_values)
  VALUES (auth.uid(), 'initialize_super_admin', 'profile', target_user_id, jsonb_build_object('role', 'super_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('bite-photos', 'bite-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: avatars
DROP POLICY IF EXISTS "avatar_select" ON storage.objects;
CREATE POLICY "avatar_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatar_insert" ON storage.objects;
CREATE POLICY "avatar_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_update" ON storage.objects;
CREATE POLICY "avatar_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_delete" ON storage.objects;
CREATE POLICY "avatar_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies: bite-photos
DROP POLICY IF EXISTS "bite_photo_select" ON storage.objects;
CREATE POLICY "bite_photo_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bite-photos' 
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "bite_photo_insert" ON storage.objects;
CREATE POLICY "bite_photo_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'bite-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "bite_photo_delete" ON storage.objects;
CREATE POLICY "bite_photo_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bite-photos' 
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    )
  );
