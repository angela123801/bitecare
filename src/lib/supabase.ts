import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables.\n\n' +
    'Create a .env file (or .env.local for local Supabase) with:\n' +
    '  VITE_SUPABASE_URL=<your supabase url>\n' +
    '  VITE_SUPABASE_ANON_KEY=<your supabase anon key>\n\n' +
    'See .env.example or .env.local.example for templates.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
