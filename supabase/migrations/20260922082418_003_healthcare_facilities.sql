/*
# Create healthcare facilities table

1. New Tables
   - `healthcare_facilities`
     - `id` (uuid, PK)
     - `name` (text, not null) - Facility name
     - `type` (text, check) - hospital, health_center, animal_bite_center, vaccination_center, veterinary_clinic
     - `address` (text)
     - `barangay_id` (uuid, FK)
     - `latitude`, `longitude` (double precision, not null) - Map coordinates
     - `phone`, `email` (text)
     - `operating_hours` (text)
     - `services` (text array)
     - `is_active` (boolean, default true)
     - `created_by` (uuid, FK to profiles)
     - `created_at`, `updated_at` (timestamptz)

2. Security
   - RLS enabled
   - All authenticated users can read active facilities
   - Only admin/super_admin can create/update/delete
*/

CREATE TABLE IF NOT EXISTS healthcare_facilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL DEFAULT 'hospital'
                    CHECK (type IN ('hospital','health_center','animal_bite_center','vaccination_center','veterinary_clinic')),
  address         text NOT NULL DEFAULT '',
  barangay_id     uuid REFERENCES barangays(id),
  latitude        double precision NOT NULL,
  longitude       double precision NOT NULL,
  phone           text DEFAULT '',
  email           text DEFAULT '',
  operating_hours text DEFAULT '',
  services        text[] DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facilities_type ON healthcare_facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_barangay ON healthcare_facilities(barangay_id);
CREATE INDEX IF NOT EXISTS idx_facilities_active ON healthcare_facilities(is_active);

ALTER TABLE healthcare_facilities ENABLE ROW LEVEL SECURITY;

-- All authenticated can read active facilities
DROP POLICY IF EXISTS "read_active_facilities" ON healthcare_facilities;
CREATE POLICY "read_active_facilities" ON healthcare_facilities FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- Admin/super_admin can insert
DROP POLICY IF EXISTS "admin_insert_facilities" ON healthcare_facilities;
CREATE POLICY "admin_insert_facilities" ON healthcare_facilities FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

-- Admin/super_admin can update
DROP POLICY IF EXISTS "admin_update_facilities" ON healthcare_facilities;
CREATE POLICY "admin_update_facilities" ON healthcare_facilities FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));

-- Admin/super_admin can delete
DROP POLICY IF EXISTS "admin_delete_facilities" ON healthcare_facilities;
CREATE POLICY "admin_delete_facilities" ON healthcare_facilities FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin'));
