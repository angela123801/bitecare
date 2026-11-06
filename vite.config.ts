import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './src/config/supabaseDefaults';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vite only hands variables prefixed with VITE_ to the browser bundle, and a
  // host such as Cloudflare Pages may inject the Supabase values under their
  // plain names. Accept every spelling, then fall back to the committed public
  // defaults so no build can end up without a connection.
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
