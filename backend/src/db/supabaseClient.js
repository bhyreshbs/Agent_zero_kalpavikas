/**
 * Supabase admin client — used ONLY by the Express backend.
 * Uses SERVICE_ROLE key → bypasses RLS, full admin access.
 * Never import this in frontend code.
 */
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
