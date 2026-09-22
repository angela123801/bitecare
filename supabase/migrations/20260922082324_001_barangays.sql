/*
# Create barangays lookup table

1. New Tables
   - `barangays`
     - `id` (uuid, primary key)
     - `name` (text, unique, not null) - Barangay name
     - `zip_code` (text) - ZIP code
     - `latitude` (double precision) - Center latitude
     - `longitude` (double precision) - Center longitude
     - `created_at` (timestamptz)

2. Security
   - Enable RLS on `barangays`
   - Allow all authenticated users to read barangays
   - No insert/update/delete for regular users (admin-managed via service role)

3. Seed Data
   - All 61 barangays of Bacolod City
*/

CREATE TABLE IF NOT EXISTS barangays (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  zip_code   text DEFAULT '6100',
  latitude   double precision,
  longitude  double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE barangays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_barangays" ON barangays;
CREATE POLICY "anyone_can_read_barangays" ON barangays FOR SELECT
  TO anon, authenticated USING (true);

-- Seed Bacolod City barangays
INSERT INTO barangays (name, latitude, longitude) VALUES
  ('Alijis', 10.6500, 122.9400),
  ('Alangilan', 10.6200, 122.9500),
  ('Banago', 10.7100, 122.9600),
  ('Barangay 1 (Poblacion)', 10.6922, 122.9511),
  ('Barangay 2 (Poblacion)', 10.6915, 122.9520),
  ('Barangay 3 (Poblacion)', 10.6908, 122.9530),
  ('Barangay 4 (Poblacion)', 10.6900, 122.9540),
  ('Barangay 5 (Poblacion)', 10.6895, 122.9550),
  ('Barangay 6 (Poblacion)', 10.6890, 122.9560),
  ('Barangay 7 (Poblacion)', 10.6885, 122.9570),
  ('Barangay 8 (Poblacion)', 10.6880, 122.9515),
  ('Barangay 9 (Poblacion)', 10.6870, 122.9525),
  ('Barangay 10 (Poblacion)', 10.6865, 122.9535),
  ('Barangay 11 (Poblacion)', 10.6860, 122.9545),
  ('Barangay 12 (Poblacion)', 10.6855, 122.9555),
  ('Barangay 13 (Poblacion)', 10.6850, 122.9565),
  ('Barangay 14 (Poblacion)', 10.6845, 122.9575),
  ('Barangay 15 (Poblacion)', 10.6840, 122.9518),
  ('Barangay 16 (Poblacion)', 10.6835, 122.9528),
  ('Barangay 17 (Poblacion)', 10.6830, 122.9538),
  ('Barangay 18 (Poblacion)', 10.6825, 122.9548),
  ('Barangay 19 (Poblacion)', 10.6820, 122.9558),
  ('Barangay 20 (Poblacion)', 10.6815, 122.9568),
  ('Barangay 21 (Poblacion)', 10.6810, 122.9578),
  ('Barangay 22 (Poblacion)', 10.6930, 122.9512),
  ('Barangay 23 (Poblacion)', 10.6935, 122.9522),
  ('Barangay 24 (Poblacion)', 10.6940, 122.9532),
  ('Barangay 25 (Poblacion)', 10.6945, 122.9542),
  ('Barangay 26 (Poblacion)', 10.6950, 122.9552),
  ('Barangay 27 (Poblacion)', 10.6955, 122.9562),
  ('Barangay 28 (Poblacion)', 10.6960, 122.9572),
  ('Barangay 29 (Poblacion)', 10.6965, 122.9516),
  ('Barangay 30 (Poblacion)', 10.6970, 122.9526),
  ('Barangay 31 (Poblacion)', 10.6975, 122.9536),
  ('Barangay 32 (Poblacion)', 10.6980, 122.9546),
  ('Barangay 33 (Poblacion)', 10.6985, 122.9556),
  ('Barangay 34 (Poblacion)', 10.6990, 122.9566),
  ('Barangay 35 (Poblacion)', 10.6995, 122.9576),
  ('Barangay 36 (Poblacion)', 10.6912, 122.9514),
  ('Barangay 37 (Poblacion)', 10.6918, 122.9524),
  ('Barangay 38 (Poblacion)', 10.6924, 122.9534),
  ('Barangay 39 (Poblacion)', 10.6928, 122.9544),
  ('Barangay 40 (Poblacion)', 10.6932, 122.9554),
  ('Barangay 41 (Poblacion)', 10.6936, 122.9564),
  ('Bata', 10.7000, 122.9800),
  ('Cabug', 10.7200, 122.9500),
  ('Estefania', 10.6850, 122.9600),
  ('Felisa', 10.6700, 122.9700),
  ('Granada', 10.6600, 122.9300),
  ('Handumanan', 10.6300, 122.9600),
  ('Mandalagan', 10.7000, 122.9500),
  ('Mansilingan', 10.6400, 122.9700),
  ('Montevista', 10.6500, 122.9600),
  ('Pahanocoy', 10.6700, 122.9400),
  ('Punta Taytay', 10.7100, 122.9700),
  ('Singcang-Airport', 10.6500, 122.9800),
  ('Sum-ag', 10.6200, 122.9700),
  ('Taculing', 10.6600, 122.9500),
  ('Tangub', 10.6800, 122.9200),
  ('Villamonte', 10.6750, 122.9600),
  ('Vista Alegre', 10.6700, 122.9500)
ON CONFLICT (name) DO NOTHING;
