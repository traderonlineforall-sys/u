import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

// Singleton Supabase client shared across modules to avoid multiple GoTrueClient warnings.
let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  return _client;
}

export const supabase = getSupabaseClient();
