/*
# Super Admin: view-only, part 3 - photo and attachment records

## 1. Purpose

Closes the last write path a Super Admin session had in the bite report
module. Migration 042 blocked a Super Admin from uploading a file into the
`bite-photos` storage bucket, but the matching record in the
`bite_report_photos` table was still writable, so a Super Admin could have
attached a file reference to any report directly through the database.

## 2. Policy changed on `public.bite_report_photos`

- `insert_report_photos` (INSERT) - a photo or attachment record may only be
  added by the Health Worker who uploaded the file, or by the resident who
  filed the report. Previously any signed-in user could attach a record to any
  report.
- `select_report_photos` (SELECT) - unchanged, so a Super Admin still views
  every photo and attachment.
- `delete_report_photos` (DELETE) - unchanged (uploader or Admin).
- `no_update_photos` (UPDATE) - unchanged (nobody).

## 3. Important notes

1. Nothing is created, altered or deleted; only write permissions change.
2. This now matches the storage upload rule exactly, so the two can no longer
   disagree: the same roles that may upload a file are the roles that may
   record it.
3. Admin keeps every case-management action it had. An Admin never uploaded a
   photo through the app, so this removes nothing reachable in the interface;
   an Admin can still review and remove attachments.
4. A resident filing a report and a Health Worker working a case are both
   unaffected.
5. Read access for every role is unchanged.
*/

DROP POLICY IF EXISTS "insert_report_photos" ON public.bite_report_photos;
CREATE POLICY "insert_report_photos"
  ON public.bite_report_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND (
      public.get_my_role() = 'health_worker'
      OR EXISTS (
        SELECT 1 FROM public.bite_reports r
        WHERE r.id = bite_report_photos.report_id
          AND r.reporter_id = auth.uid()
      )
    )
  );
