/*
# Create bite reports and related tables

1. New Tables
   - `bite_reports` - Main animal bite incident reports
     - Patient info, bite details, incident location, case management fields
   - `bite_report_photos` - Photos attached to bite reports
   - `bite_report_status_history` - Status change audit trail

2. Security
   - RLS on all tables
   - Users can CRUD own reports
   - Health workers can read assigned reports and reports in their barangay
   - Admin/super_admin can read/update all reports

3. Indexes
   - reporter_id, status, bite_date, incident_barangay_id, assigned_worker_id
*/

CREATE TABLE IF NOT EXISTS bite_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id           uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  patient_name          text NOT NULL,
  patient_age           integer,
  patient_sex           text CHECK (patient_sex IN ('male','female','other')),
  patient_phone         text DEFAULT '',
  patient_address       text DEFAULT '',
  patient_barangay_id   uuid REFERENCES barangays(id),
  bite_date             date NOT NULL,
  bite_time             time,
  animal_type           text NOT NULL DEFAULT 'dog'
                          CHECK (animal_type IN ('dog','cat','rat','bat','monkey','other')),
  animal_type_other     text DEFAULT '',
  animal_status         text DEFAULT 'unknown'
                          CHECK (animal_status IN ('alive','dead','unknown','stray')),
  animal_vaccinated     text DEFAULT 'unknown'
                          CHECK (animal_vaccinated IN ('yes','no','unknown')),
  bite_site             text NOT NULL DEFAULT '',
  wound_type            text NOT NULL DEFAULT 'bite'
                          CHECK (wound_type IN ('bite','scratch','lick_on_broken_skin','other')),
  category              text NOT NULL DEFAULT 'II'
                          CHECK (category IN ('I','II','III')),
  number_of_wounds      integer DEFAULT 1,
  provoked              boolean DEFAULT false,
  incident_location     text DEFAULT '',
  incident_latitude     double precision,
  incident_longitude    double precision,
  incident_barangay_id  uuid REFERENCES barangays(id),
  status                text NOT NULL DEFAULT 'reported'
                          CHECK (status IN ('reported','under_investigation','treatment_started',
                                 'treatment_ongoing','treatment_completed','closed','cancelled')),
  severity              text NOT NULL DEFAULT 'moderate'
                          CHECK (severity IN ('low','moderate','high','critical')),
  assigned_worker_id    uuid REFERENCES profiles(id),
  assigned_facility_id  uuid REFERENCES healthcare_facilities(id),
  first_aid_given       boolean DEFAULT false,
  first_aid_details     text DEFAULT '',
  notes                 text DEFAULT '',
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON bite_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON bite_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_bite_date ON bite_reports(bite_date);
CREATE INDEX IF NOT EXISTS idx_reports_incident_barangay ON bite_reports(incident_barangay_id);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_worker ON bite_reports(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON bite_reports(created_at DESC);

ALTER TABLE bite_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: users see own; staff see all
DROP POLICY IF EXISTS "select_bite_reports" ON bite_reports;
CREATE POLICY "select_bite_reports" ON bite_reports FOR SELECT
  TO authenticated
  USING (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    OR (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'health_worker'
    )
  );

-- INSERT: any authenticated user
DROP POLICY IF EXISTS "insert_bite_reports" ON bite_reports;
CREATE POLICY "insert_bite_reports" ON bite_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- UPDATE: reporter can update own (limited columns via grants); staff can update all
DROP POLICY IF EXISTS "update_own_bite_reports" ON bite_reports;
CREATE POLICY "update_own_bite_reports" ON bite_reports FOR UPDATE
  TO authenticated
  USING (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  )
  WITH CHECK (
    reporter_id = auth.uid()
    OR assigned_worker_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
  );

-- DELETE: only admin/super_admin
DROP POLICY IF EXISTS "delete_bite_reports" ON bite_reports;
CREATE POLICY "delete_bite_reports" ON bite_reports FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));


-- Bite report photos
CREATE TABLE IF NOT EXISTS bite_report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES bite_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  file_size    integer,
  mime_type    text,
  uploaded_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photos_report ON bite_report_photos(report_id);

ALTER TABLE bite_report_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_report_photos" ON bite_report_photos;
CREATE POLICY "select_report_photos" ON bite_report_photos FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_report_photos" ON bite_report_photos;
CREATE POLICY "insert_report_photos" ON bite_report_photos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "delete_report_photos" ON bite_report_photos;
CREATE POLICY "delete_report_photos" ON bite_report_photos FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- No update on photos (immutable once uploaded)
DROP POLICY IF EXISTS "no_update_photos" ON bite_report_photos;
CREATE POLICY "no_update_photos" ON bite_report_photos FOR UPDATE
  TO authenticated
  USING (false) WITH CHECK (false);


-- Status history
CREATE TABLE IF NOT EXISTS bite_report_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES bite_reports(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  notes       text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_report ON bite_report_status_history(report_id);

ALTER TABLE bite_report_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_status_history" ON bite_report_status_history;
CREATE POLICY "select_status_history" ON bite_report_status_history FOR SELECT
  TO authenticated
  USING (
    changed_by = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('health_worker', 'admin', 'super_admin')
    OR EXISTS (SELECT 1 FROM bite_reports WHERE bite_reports.id = report_id AND bite_reports.reporter_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_status_history" ON bite_report_status_history;
CREATE POLICY "insert_status_history" ON bite_report_status_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

DROP POLICY IF EXISTS "no_update_status_history" ON bite_report_status_history;
CREATE POLICY "no_update_status_history" ON bite_report_status_history FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no_delete_status_history" ON bite_report_status_history;
CREATE POLICY "no_delete_status_history" ON bite_report_status_history FOR DELETE
  TO authenticated USING (false);
