import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from '@/config/supabaseDefaults';

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Environment settings win, so a build can be pointed at another Supabase
// project. Otherwise the committed public defaults are used, which is what
// keeps a build on a host with no environment variables (Cloudflare Pages)
// working instead of rendering the "Configuration Required" screen.
const supabaseUrl = envUrl || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = envAnonKey || DEFAULT_SUPABASE_ANON_KEY;

// Kept so the entry point still renders a helpful screen rather than a blank
// page if the values above are ever emptied. With the defaults committed this
// is always true.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
