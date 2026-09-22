-- =============================================================================
-- BiteCare Local Development Seed Data
-- =============================================================================
-- This file is automatically run after migrations when using `supabase db reset`.
-- All data here is TEST/DEVELOPMENT data only.
-- NEVER insert real patient information.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sample Healthcare Facilities
-- ---------------------------------------------------------------------------
INSERT INTO healthcare_facilities (name, type, address, latitude, longitude, phone, operating_hours, services, is_active)
VALUES
  ('Bacolod City General Hospital', 'hospital', 'Lacson Street, Bacolod City', 10.6820, 122.9580, '(034) 434-1234', 'Open 24/7', ARRAY['Emergency','Animal Bite Treatment','Rabies Vaccination','Post-Exposure Prophylaxis'], true),
  ('Bacolod Animal Bite Treatment Center', 'animal_bite_center', 'City Health Office, Bacolod City', 10.6850, 122.9700, '(034) 434-5678', 'Mon-Fri 8:00 AM - 5:00 PM', ARRAY['Rabies Vaccination','Post-Exposure Prophylaxis','Wound Treatment'], true),
  ('Negros Occidental Provincial Health Center', 'health_center', 'Gatuslao Street, Bacolod City', 10.6780, 122.9650, '(034) 709-0001', 'Mon-Sat 7:00 AM - 6:00 PM', ARRAY['General Consultation','Vaccination','Health Education'], true),
  ('Dr. Pablo O. Torre Memorial Hospital', 'hospital', 'Lopez Jaena Street, Bacolod City', 10.6900, 122.9750, '(034) 434-9012', 'Open 24/7', ARRAY['Emergency','Surgery','Animal Bite Treatment'], true),
  ('Bacolod Veterinary Clinic', 'veterinary_clinic', 'Hilado Street, Bacolod City', 10.6830, 122.9720, '(034) 432-1111', 'Mon-Sat 9:00 AM - 5:00 PM', ARRAY['Animal Vaccination','Animal Examination','Pet Registration'], true)
ON CONFLICT DO NOTHING;
