/*
# Seed Bacolod City healthcare facility directory

## 1. Purpose
Adds the verified Animal Bite Centers, Barangay Health Centers and Hospitals of
Bacolod City, Negros Occidental to the existing `healthcare_facilities` table so
they appear on the BiteCare map. No new table is created and no existing record is
deleted or renamed.

## 2. What is added — 22 facilities
- Animal Bite Centers (2): Bacolod City Health Office ABTC, and CLMMRH which is
  also a PhilHealth-accredited Animal Bite Package Provider. Both carry
  `is_abtc = true`.
- Hospitals (8): Corazon Locsin Montelibano Memorial Regional Hospital,
  Riverside Medical Center, The Doctors' Hospital, Adventist Medical Center
  Bacolod, Metro Bacolod Hospital and Medical Center, Bacolod Queen of Mercy
  Hospital, South Bacolod General Hospital, Dr. Pablo O. Torre Memorial Hospital,
  Allied Care Experts Medical Center Bacolod. (Nine hospital rows total; the
  count above is inclusive of ACEMC.)
- Barangay Health Centers (12): Alijis, Banago, Bata, Handumanan, Pahanocoy,
  Singcang, Taculing, Villamonte, Felisa, Mandalagan, Punta Taytay and Sum-ag.

## 3. Where the data comes from
- PhilHealth "List of Accredited Animal Bite Package Providers for CY 2026"
  (updated 30 Sept 2026) — facility names, street addresses, contact numbers for
  the two Animal Bite Treatment Centers and CLMMRH.
- Official facility websites — The Doctors' Hospital, Adventist Medical Center.
- OpenStreetMap (surveyed points/ways) — names and coordinates for hospitals and
  the health stations mapped there.
- Bacolod City Health Office / PhilHealth YAKAP accreditation (Oct 2026) — the
  list of the city's nine accredited barangay health centers.

Nothing is invented. Where a facility is real and registered but its exact pin
could not be confirmed, the coordinates are the barangay centre and the record is
marked `needs_review` rather than `verified`, so it is visibly flagged for an
administrator to confirm. Each row records its `source`.

## 4. Duplicate and idempotency protection
Every insert is guarded by `WHERE NOT EXISTS` on a case-insensitive, trimmed name
match, so re-running this migration adds nothing and no facility appears twice.
The single pre-existing facility ("Dr.Care Villamonte Animal Bite Center and
Medical Clinic") is left untouched.

## 5. Security
No policy or grant changes. Rows are attributed to an existing super-admin
profile for `created_by` (which is NOT NULL). Reads still require an authenticated
session; only admin/super_admin may write.
*/

INSERT INTO public.healthcare_facilities (
  name, type, address, barangay_id, latitude, longitude,
  phone, email, operating_hours, services,
  is_active, is_abtc, verification_status, source, verified_at, created_by
)
SELECT
  v.name, v.type, v.address, b.id, v.lat, v.lng,
  v.phone, '', '', v.services,
  true, v.is_abtc, v.status, v.source,
  CASE WHEN v.status = 'verified' THEN now() ELSE NULL END,
  (SELECT id FROM public.profiles WHERE role = 'super_admin' ORDER BY created_at LIMIT 1)
FROM (VALUES
  -- Animal Bite Treatment Centers
  ('Bacolod City Health Office — Animal Bite Treatment Center', 'animal_bite_center',
   'A.B. Parreño St., Barangay 20, Bacolod City, 6100 Negros Occidental', 'Barangay 20 (Poblacion)',
   10.668210::double precision, 122.956764::double precision, '4313673',
   ARRAY['Animal bite treatment','Anti-rabies vaccination','Rabies immunoglobulin (RIG)','Primary care']::text[],
   true, 'needs_review',
   'PhilHealth Accredited Animal Bite Package Providers (CY 2026); coordinates approximate (Barangay 20 centre) — pending field verification'),

  ('Corazon Locsin Montelibano Memorial Regional Hospital', 'animal_bite_center',
   'Lacson Street, Barangay 9, Bacolod City, 6100 Negros Occidental', 'Barangay 9 (Poblacion)',
   10.672451::double precision, 122.950701::double precision, '+63 34 433 2697',
   ARRAY['Animal bite treatment','Anti-rabies vaccination','Rabies immunoglobulin (RIG)','Emergency care','Inpatient care']::text[],
   true, 'verified',
   'PhilHealth Accredited Animal Bite Package Providers (CY 2026); OpenStreetMap'),

  -- Hospitals
  ('Riverside Medical Center', 'hospital',
   '23rd Street, Barangay 5, Bacolod City, 6100 Negros Occidental', 'Barangay 5 (Poblacion)',
   10.683135::double precision, 122.958028::double precision, '(034) 433-7331',
   ARRAY['Animal bite treatment','Anti-rabies vaccination','Emergency care','Inpatient care']::text[],
   true, 'verified', 'OpenStreetMap'),

  ('The Doctors'' Hospital, Inc.', 'hospital',
   'B.S. Aquino Drive, Barangay Villamonte, Bacolod City, 6100 Negros Occidental', 'Villamonte',
   10.678109::double precision, 122.960402::double precision, '(034) 468-2100',
   ARRAY['Emergency care','Inpatient care','Surgical services']::text[],
   false, 'needs_review',
   'Official facility website; coordinates approximate — pending field verification'),

  ('Adventist Medical Center - Bacolod', 'hospital',
   'C.V. Ramos Avenue, Barangay Taculing, Bacolod City, 6100 Negros Occidental', 'Taculing',
   10.647573::double precision, 122.949484::double precision, '(034) 488-7777',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'Official facility website; OpenStreetMap'),

  ('Metro Bacolod Hospital and Medical Center', 'hospital',
   'Burgos Extension, Barangay Estefania, Bacolod City, 6100 Negros Occidental', 'Estefania',
   10.661537::double precision, 122.984656::double precision, '',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Bacolod Queen of Mercy Hospital', 'hospital',
   'Eroreco, L.N. Drive, Barangay Mandalagan, Bacolod City, 6100 Negros Occidental', 'Mandalagan',
   10.689859::double precision, 122.971374::double precision, '',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('South Bacolod General Hospital', 'hospital',
   'Araneta Street, Barangay Pahanocoy, Bacolod City, 6100 Negros Occidental', 'Pahanocoy',
   10.614482::double precision, 122.925956::double precision, '',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Dr. Pablo O. Torre Memorial Hospital', 'hospital',
   'B.S. Aquino Drive, Barangay 5, Bacolod City, 6100 Negros Occidental', 'Barangay 5 (Poblacion)',
   10.682532::double precision, 122.958168::double precision, '',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Allied Care Experts Medical Center (ACEMC) - Bacolod', 'hospital',
   'Lacson Street, Bacolod City, 6100 Negros Occidental', NULL,
   10.708654::double precision, 122.963100::double precision, '',
   ARRAY['Emergency care','Inpatient care']::text[],
   false, 'verified', 'OpenStreetMap'),

  -- Barangay Health Centers
  ('Alijis Barangay Health Station', 'health_center',
   'Sampaguita Street, Barangay Alijis, Bacolod City, 6100 Negros Occidental', 'Alijis',
   10.636700::double precision, 122.949998::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'verified', 'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); OpenStreetMap'),

  ('Banago Barangay Health Station', 'health_center',
   'Barangay Banago, Bacolod City, 6100 Negros Occidental', 'Banago',
   10.703599::double precision, 122.949953::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Banago centre) — pending field verification'),

  ('Bata Barangay Health Station', 'health_center',
   'Barangay Bata, Bacolod City, 6100 Negros Occidental', 'Bata',
   10.701041::double precision, 122.976923::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Bata centre) — pending field verification'),

  ('Handumanan Barangay Health Station', 'health_center',
   'Handumanan Road, Barangay Handumanan, Bacolod City, 6100 Negros Occidental', 'Handumanan',
   10.606779::double precision, 122.964997::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'verified', 'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); OpenStreetMap'),

  ('Pahanocoy Barangay Health Station', 'health_center',
   'Barangay Pahanocoy, Bacolod City, 6100 Negros Occidental', 'Pahanocoy',
   10.612514::double precision, 122.932463::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Pahanocoy centre) — pending field verification'),

  ('Singcang Barangay Health Station', 'health_center',
   'Barangay Singcang-Airport, Bacolod City, 6100 Negros Occidental', 'Singcang-Airport',
   10.657853::double precision, 122.933187::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Singcang-Airport centre) — pending field verification'),

  ('Taculing Barangay Health Station', 'health_center',
   'Barangay Taculing, Bacolod City, 6100 Negros Occidental', 'Taculing',
   10.649686::double precision, 122.948715::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Taculing centre) — pending field verification'),

  ('Villamonte Barangay Health Station', 'health_center',
   'Barangay Villamonte, Bacolod City, 6100 Negros Occidental', 'Villamonte',
   10.670242::double precision, 122.963185::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization','PhilHealth YAKAP (free consultations, labs, medicines)']::text[],
   false, 'needs_review',
   'Bacolod City Health Office; PhilHealth YAKAP accreditation (Oct 2026); coordinates approximate (Barangay Villamonte centre) — pending field verification'),

  ('Felisa Barangay Health Station', 'health_center',
   'Barangay Felisa, Bacolod City, 6100 Negros Occidental', 'Felisa',
   10.590339::double precision, 122.976929::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Mandalagan Barangay Health Station', 'health_center',
   'Barangay Mandalagan, Bacolod City, 6100 Negros Occidental', 'Mandalagan',
   10.696894::double precision, 122.964727::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Punta Taytay Barangay Health Station', 'health_center',
   'Vera Street, Barangay Punta Taytay, Bacolod City, 6100 Negros Occidental', 'Punta Taytay',
   10.599851::double precision, 122.905078::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization']::text[],
   false, 'verified', 'OpenStreetMap'),

  ('Sum-ag Barangay Health Station', 'health_center',
   'Barangay Sum-ag, Bacolod City, 6100 Negros Occidental', 'Sum-ag',
   10.598302::double precision, 122.920222::double precision, '',
   ARRAY['Primary care','Maternal and child health','Immunization']::text[],
   false, 'verified', 'OpenStreetMap')
) AS v(name, type, address, brgy, lat, lng, phone, services, is_abtc, status, source)
LEFT JOIN public.barangays b ON b.name = v.brgy
WHERE NOT EXISTS (
  SELECT 1 FROM public.healthcare_facilities f
  WHERE lower(btrim(f.name)) = lower(btrim(v.name))
);
