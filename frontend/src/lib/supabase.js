/**
 * Supabase browser client — uses the PUBLIC anon key only.
 * Safe for frontend. Never contains the service role key.
 */
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
