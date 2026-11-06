/*
# Healthcare facility directory — verification & duplicate protection

## 1. Purpose
Prepares the existing `healthcare_facilities` table to hold a full, trustworthy
directory of Bacolod City facilities (Animal Bite Centers, Health Centers,
Hospitals) without adding a second table or duplicating the existing data model.

## 2. New columns on `healthcare_facilities`
- `verification_status` (text, default `'unverified'`)
    - `'verified'`      — facility identity AND coordinates confirmed against a
                          reliable source (official directory / OpenStreetMap).
    - `'needs_review'`  — facility is real and registered, but the exact pin is a
                          barangay-centroid approximation. Shown on the map with a
                          badge and flagged for an administrator to confirm.
    - `'unverified'`    — added by a user, not yet checked at all (default).
- `source` (text, default `''`) — where the record came from, e.g.
  "PhilHealth Accredited Animal Bite Package Providers (CY 2026)".
- `is_abtc` (boolean, default `false`) — true when the facility is a registered
  Animal Bite Treatment Center. A hospital can be `type = 'hospital'` and still
  be an ABTC, so this is tracked separately. Prevents the map from implying that
  every nearby facility treats animal bites.
- `verified_at` (timestamptz, nullable) — when an administrator last confirmed it.

## 3. Existing data
The single existing row is backfilled to `'needs_review'` so it is flagged for an
administrator to confirm rather than being presented as confirmed. No rows are
deleted or renamed. `is_active` is untouched.

## 4. Duplicate protection
A unique index on `lower(btrim(name))` stops the same facility being added twice.
Creation succeeds because the table currently holds one uniquely-named row.

## 5. Security
No policy or grant changes. The table already has RLS enabled with
select/insert/update/delete policies scoped to `authenticated`, and table-level
grants for `authenticated`; new columns inherit those grants. Read access still
requires an authenticated session, and only admin/super_admin may write.
*/

ALTER TABLE public.healthcare_facilities
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_abtc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'healthcare_facilities_verification_status_check'
      AND conrelid = 'public.healthcare_facilities'::regclass
  ) THEN
    ALTER TABLE public.healthcare_facilities
      ADD CONSTRAINT healthcare_facilities_verification_status_check
      CHECK (verification_status IN ('verified', 'unverified', 'needs_review'));
  END IF;
END $$;

-- Flag the pre-existing record for administrative confirmation.
UPDATE public.healthcare_facilities
   SET verification_status = 'needs_review',
       source = 'Added through BiteCare facility management; coordinates and contact details not yet independently confirmed'
 WHERE verification_status = 'unverified'
   AND source = '';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_healthcare_facility_name
  ON public.healthcare_facilities (lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_facilities_verification
  ON public.healthcare_facilities (verification_status);

CREATE INDEX IF NOT EXISTS idx_facilities_abtc
  ON public.healthcare_facilities (is_abtc) WHERE is_abtc = true;
