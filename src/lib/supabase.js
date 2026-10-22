import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_PUBLIC')
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
