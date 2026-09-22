/*
# Create vaccination records table

1. New Tables
   - `vaccination_records`
     - Tracks individual vaccine doses tied to bite reports
     - Supports Essen regimen (Day 0, 3, 7, 14, 28)
     - Vaccine types: PVRV, PCECV, ERIG, HRIG, TT
     - Status tracking: scheduled, completed, missed, cancelled, rescheduled

2. Security
   - RLS enabled
   - Users see own vaccination records (via report ownership)
   - Health workers can CRUD records they create or are assigned to
   - Admin/super_admin have full access
*/

CREATE TABLE IF NOT EXISTS vaccination_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES bite_reports(id) ON DELETE CASCADE,
  patient_name      text NOT NULL,
  vaccine_type      text NOT NULL DEFAULT 'PVRV'
                      CHECK (vaccine_type IN ('PVRV','PCECV','ERIG','HRIG','TT')),
  dose_number       integer NOT NULL,
  dose_label        text NOT NULL DEFAULT '',
  scheduled_date    date NOT NULL,
  administered_date date,
  administered_by   uuid REFERENCES profiles(id),
  facility_id       uuid REFERENCES healthcare_facilities(id),
  batch_number      text DEFAULT '',
  site_of_injection text DEFAULT '',
  adverse_reaction  text DEFAULT '',
  status            text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','completed','missed','cancelled','rescheduled')),
  notes             text DEFAULT '',
  created_by        uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vacc_report ON vaccination_records(report_id);
CREATE INDEX IF NOT EXISTS idx_vacc_scheduled ON vaccination_records(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vacc_status ON vaccination_records(status);
CREATE INDEX IF NOT EXISTS idx_vacc_created_by ON vaccination_records(created_by);

ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;

-- SELECT: user sees own (via report); staff sees all
DROP POLICY IF EXISTS "select_vaccination_records" ON vaccination_records;
CREATE POLICY "select_vaccination_records" ON vaccination_records FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR administered_by = auth.uid()
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  );

-- INSERT: health_worker, admin, super_admin
DROP POLICY IF EXISTS "staff_insert_vaccination" ON vaccination_records;
CREATE POLICY "staff_insert_vaccination" ON vaccination_records FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  );

-- UPDATE: staff only
DROP POLICY IF EXISTS "staff_update_vaccination" ON vaccination_records;
CREATE POLICY "staff_update_vaccination" ON vaccination_records FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  );

-- DELETE: admin/super_admin only
DROP POLICY IF EXISTS "admin_delete_vaccination" ON vaccination_records;
CREATE POLICY "admin_delete_vaccination" ON vaccination_records FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));
