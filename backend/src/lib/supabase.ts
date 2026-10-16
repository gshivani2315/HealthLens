import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Admin client (service role): create users, verify any token. Server-only.
export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Public client (anon key): used for the password sign-in grant, same as a browser would use.
export const supabaseAuth = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});