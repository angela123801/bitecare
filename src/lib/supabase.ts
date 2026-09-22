import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True when the required settings are present. Checked by the entry point so a
// missing configuration renders a helpful screen instead of a white page.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Never throw at module load: this module is imported by the app's entry graph,
// so throwing here would crash before React mounts (blank screen, no error UI).
export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'public-anon-key-not-configured',
);
