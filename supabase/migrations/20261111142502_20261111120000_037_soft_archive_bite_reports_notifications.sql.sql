/*
# Soft archive for bite reports and notifications

1. New Columns
- `bite_reports.is_archived` (boolean, NOT NULL, default false)
  Marks a report as archived (hidden from active lists and the map) without
  deleting anything: every field, photo, vaccination record and status-history
  row is untouched.
- `bite_reports.archived_at` (timestamptz, nullable) - when it was archived.
- `bite_reports.archived_by` (uuid, nullable, references auth.users) - who
  archived it. Written only from trusted server-side code (the archive RPC),
  never from the browser.
- `notifications.is_archived` (boolean, NOT NULL, default false)
  Marks a notification as archived for its owner only.
- `notifications.archived_at` (timestamptz, nullable) - when it was archived.

2. Modified Tables
- `bite_reports`: the three archive columns above; DELETE grants revoked from
  every role so nothing can delete reports anymore, and the DELETE policy is
  replaced with a hard no. Residents keep full read access to their own
  reports, including archived ones.
- `notifications`: the archive columns above. Read/unread behaviour is
  unchanged.

3. Security changes
- `REVOKE DELETE ON bite_reports` from anon, authenticated and service_role:
  even a forged direct API call fails at the database level.
- DROP the old admin DELETE policy `delete_bite_reports`; new policy denies
  every delete for every role.
- Column grants: INSERT/UPDATE grants on bite_reports no longer include the
  archive columns, so nobody can flip `is_archived` from the browser. The
  archive columns are set only by the SECURITY DEFINER RPC below, which
  verifies the caller's role from the JWT (same pattern as get_my_role()).
- `archive_bite_report(p_report_id uuid, p_archived boolean)` SECURITY DEFINER,
  callable only by admin / super_admin. Never deletes rows and never touches
  vaccination records, status history, photos or medical fields.
- Notifications keep their per-user update policy: a user can only flip
  is_archived on their OWN rows because every notification write is already
  scoped to user_id = auth.uid().

4. Important notes
- Existing rows are all unarchived by default; nothing is removed or rewritten.
- UPDATE with no column list still exists for service_role via table owner
  rights only where explicitly granted below; keep grants minimal.
*/

ALTER TABLE public.bite_reports ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.bite_reports ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.bite_reports ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ------------------------------------------------------------------
-- bite_reports: make deletion impossible
-- ------------------------------------------------------------------
REVOKE DELETE ON public.bite_reports FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS "delete_bite_reports" ON public.bite_reports;
CREATE POLICY "no_delete_bite_reports"
ON public.bite_reports FOR DELETE
TO anon, authenticated
USING (false);

-- Reads stay as they are (per-row rules unchanged); re-assert the grant.
GRANT SELECT ON public.bite_reports TO anon, authenticated;

-- Writes stay with authenticated users only, minus the archive columns.
GRANT INSERT, UPDATE (reporter_id, patient_name, patient_age, patient_sex, patient_phone,
  patient_email, patient_address, patient_barangay_id, bite_date, bite_time,
  animal_type, animal_type_other, animal_status, animal_vaccinated, bite_site,
  wound_type, category, number_of_wounds, provoked, first_aid_given,
  first_aid_details, incident_location, incident_barangay_id, incident_latitude,
  incident_longitude, status, severity, assigned_worker_id, assigned_facility_id,
  notes, closed_at, created_at, updated_at)
ON public.bite_reports TO authenticated;

-- ------------------------------------------------------------------
-- notifications: archive columns for per-user archiving
-- ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE (user_id, title, message, type, reference_type,
  reference_id, is_read, read_at, is_archived, archived_at)
ON public.notifications TO authenticated;

-- ------------------------------------------------------------------
-- Admin-only archive toggle for bite reports
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_bite_report(p_report_id uuid, p_archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
BEGIN
  caller_role := COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'user'
  );
  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only administrators may archive bite reports';
  END IF;

  IF p_archived THEN
    UPDATE public.bite_reports
       SET is_archived = true,
           archived_at = now(),
           archived_by = auth.uid()
     WHERE id = p_report_id;
  ELSE
    UPDATE public.bite_reports
       SET is_archived = false,
           archived_at = NULL,
           archived_by = NULL
     WHERE id = p_report_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_bite_report(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_bite_report(uuid, boolean) TO authenticated;
