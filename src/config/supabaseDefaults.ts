/**
 * BiteCare's Supabase connection, committed to the project on purpose.
 *
 * These two values are public by design and are NOT secrets:
 *
 *  - The project URL is visible in every request the browser makes.
 *  - The anon key is Supabase's public browser key, the direct equivalent of
 *    Firebase's apiKey. It only ever grants the access that Row Level Security
 *    allows. Verified on this project: signed-out callers get zero rows from
 *    `profiles` and `bite_reports`; only public reference data such as the
 *    barangay list is readable.
 *
 * Committing them means the app always has a connection: a build on Cloudflare
 * Pages has no `.env` file, so without a built-in fallback the browser bundle
 * ships with the values missing and the app shows the "Configuration Required"
 * screen instead of the login page.
 *
 * The privileged keys (service_role, database URL, SMS gateway keys) are NOT
 * here and must never be added here. They live only as Edge Function secrets.
 *
 * To point a build at a different Supabase project, set VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY in the environment; those override these defaults.
 */

export const DEFAULT_SUPABASE_URL = 'https://mhvkzcfrlmpdawicrnwp.supabase.co';

export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1odmt6Y2ZybG1wZGF3aWNybndwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjAzNjcsImV4cCI6MjEwNTYzNjM2N30.RZ1BDvlWKW2rElb-ET_TI8h9Y0fKG6_iPJzShS_uC9A';
