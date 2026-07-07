import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (.env / .env.local)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Bypass the Web Locks API — prevents "lock timed out" errors with multiple
    // tabs open or when the browser lock isn't released cleanly. (From SportsLab.)
    lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
});

// Expose for interop with the vanilla modules during the strangler migration
// (e.g. src/js/r2-upload.js reads window.supabase). Removed once fully ported.
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}
