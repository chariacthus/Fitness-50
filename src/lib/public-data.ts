import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Cookie-less Supabase client for data that every visitor may read
 * (site settings, active products). Because it does not touch cookies, public
 * pages can be pre-rendered and served instantly from the cache.
 * Row Level Security still applies (anon role).
 */
export function createPublicClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
