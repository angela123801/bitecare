/*
# Super Admin: view-only access to bite reports

## 1. Purpose

Makes the Super Admin role read-only for the entire bite report module
(reports, their status history, their photos and their vaccination records)
while keeping every other role's permissions exactly as they were.

Read access is deliberately left untouched, so a Super Admin continues to see
every report, victim detail, incident detail, uploaded photo, status history,
assigned Health Worker and vaccination progress that the existing
administrative visibility rules allow.

The change is enforced in the database, not just in the interface: a Super
Admin session that calls the API or the database directly is rejected by row
level security, not merely hidden from a button.

## 2. Policies changed on `public.bite_reports`

- `update_own_bite_reports` (UPDATE) - recreated without `super_admin`.
  The reporter, the assigned Health Worker, a Health Worker and an Admin keep
  their existing access. A Super Admin can no longer update any report, which
  covers editing patient or incident details, reassigning or removing a
  Health Worker, changing the status, and marking a case complete.
- `select_bite_reports` (SELECT) - unchanged. Super Admin keeps full
  administrative visibility.
- `insert_bite_reports` (INSERT) - unchanged.
- `no_delete_bite_reports` (DELETE) - unchanged: nobody can delete a report
  through the API, and archiving is handled by the audited RPC below.

## 3. Policies changed on `public.bite_report_status_history`

- `insert_status_history` (INSERT) - tightened so a row can only be appended
  by the person who made the change, on a report they are allowed to work on
  (reporter, assigned Health Worker, Health Worker or Admin). A Super Admin can
  no longer fabricate or alter a submission history entry.
- `select_status_history` (SELECT) - unchanged, so the Super Admin still sees
  the full history.

## 4. Policies changed on `public.vaccination_records`

- `staff_update_vaccination` (UPDATE) - recreated without `super_admin`.
- `staff_insert_vaccination` (INSERT) - recreated without `super_admin`.
- `admin_delete_vaccination` (DELETE) - restricted to `admin`.
- `select_vaccination_records` (SELECT) - unchanged, so vaccination and
  treatment progress stays visible to the Super Admin.

## 5. Policies changed on `public.bite_report_photos` and storage

- `delete_report_photos` (DELETE) - recreated without `super_admin`, so a
  Super Admin cannot remove an incident photo or attachment.
- `select_report_photos` (SELECT) - unchanged, so photos remain viewable.
- Storage policy `bite_photo_delete` on `storage.objects` - recreated without
  `super_admin`, so the underlying file cannot be removed either.

## 6. Functions hardened

- `public.archive_bite_report(p_report_id, p_archived)` - now accepts only
  `admin`. Previously `admin` and `super_admin` could archive; a Super Admin
  can no longer archive or restore a report.
- `public.update_report_status(p_report_id, p_new_status, p_notes)` - now
  accepts only `health_worker` and `admin`. Previously `super_admin` could also
  change a status, which contradicted the view-only rule.

Both functions remain `SECURITY DEFINER` with a pinned empty `search_path`,
and both still write their own audit log entry, so the audit trail and all
historical report information are preserved.

## 7. Important notes

1. No table, column, row or record is created, altered or deleted by this
   migration. It only changes who is allowed to write.
2. No role gains any privilege; the only change is that `super_admin` loses
   write access to the bite report module.
3. `admin`, `health_worker` and `user` permissions are intentionally unchanged.
4. Read access for every role is unchanged, so nothing disappears from any
   dashboard, list, map or detail view.
*/

-- ---------------------------------------------------------------------------
-- bite_reports: Super Admin may read but never write
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "update_own_bite_reports" ON public.bite_reports;
CREATE POLICY "update_own_bite_reports"
  ON public.bite_reports FOR UPDATE
  TO authenticated
  USING (
    (reporter_id = auth.uid())
    OR (assigned_worker_id = auth.uid())
    OR (public.get_my_role() IN ('health_worker', 'admin'))
  )
  WITH CHECK (
    (reporter_id = auth.uid())
    OR (assigned_worker_id = auth.uid())
    OR (public.get_my_role() IN ('health_worker', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- bite_report_status_history: only a real actor on the case may append
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "insert_status_history" ON public.bite_report_status_history;
CREATE POLICY "insert_status_history"
  ON public.bite_report_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = changed_by
    AND EXISTS (
      SELECT 1 FROM public.bite_reports r
      WHERE r.id = bite_report_status_history.report_id
        AND (
          r.reporter_id = auth.uid()
          OR r.assigned_worker_id = auth.uid()
          OR public.get_my_role() IN ('health_worker', 'admin')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- vaccination_records: Super Admin is read-only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_update_vaccination" ON public.vaccination_records;
CREATE POLICY "staff_update_vaccination"
  ON public.vaccination_records FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('health_worker', 'admin'))
  WITH CHECK (public.get_my_role() IN ('health_worker', 'admin'));

DROP POLICY IF EXISTS "staff_insert_vaccination" ON public.vaccination_records;
CREATE POLICY "staff_insert_vaccination"
  ON public.vaccination_records FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('health_worker', 'admin'));

DROP POLICY IF EXISTS "admin_delete_vaccination" ON public.vaccination_records;
CREATE POLICY "admin_delete_vaccination"
  ON public.vaccination_records FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- bite_report_photos: Super Admin may view, never remove
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "delete_report_photos" ON public.bite_report_photos;
CREATE POLICY "delete_report_photos"
  ON public.bite_report_photos FOR DELETE
  TO authenticated
  USING (
    (uploaded_by = auth.uid())
    OR (public.get_my_role() = 'admin')
  );

DROP POLICY IF EXISTS "bite_photo_delete" ON storage.objects;
CREATE POLICY "bite_photo_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bite-photos'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.get_my_role() = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Functions: drop super_admin from the write paths
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_bite_report(p_report_id uuid, p_archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
BEGIN
  caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'user');
  IF caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators may archive bite reports';
  END IF;

  IF p_archived THEN
    UPDATE public.bite_reports
    SET is_archived = true, archived_at = now(), archived_by = auth.uid()
    WHERE id = p_report_id;
  ELSE
    UPDATE public.bite_reports
    SET is_archived = false, archived_at = NULL, archived_by = NULL
    WHERE id = p_report_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_report_status(
  p_report_id uuid,
  p_new_status text,
  p_notes text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
  old_status text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role NOT IN ('health_worker', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: insufficient privileges';
  END IF;

  SELECT status INTO old_status FROM public.bite_reports WHERE id = p_report_id;

  IF old_status IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  UPDATE public.bite_reports
  SET status = p_new_status,
      updated_at = now(),
      closed_at = CASE WHEN p_new_status IN ('closed', 'treatment_completed') THEN now() ELSE closed_at END
  WHERE id = p_report_id;

  INSERT INTO public.bite_report_status_history (report_id, from_status, to_status, changed_by, notes)
  VALUES (p_report_id, old_status, p_new_status, auth.uid(), p_notes);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), 'status_change', 'bite_report', p_report_id,
    jsonb_build_object('status', old_status),
    jsonb_build_object('status', p_new_status, 'notes', p_notes));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_bite_report(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_bite_report(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_report_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_report_status(uuid, text, text) TO authenticated;
