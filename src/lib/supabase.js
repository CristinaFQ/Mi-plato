import { createClient } from '@supabase/supabase-js';
// Accept the REST endpoint copied from the dashboard (…/rest/v1/); supabase-js expects the project root.
const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_PUBLIC')
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
