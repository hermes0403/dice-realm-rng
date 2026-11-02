import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

// Keep the existing CDN-provided Supabase client and options unchanged.
export const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});