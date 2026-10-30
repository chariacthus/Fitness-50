"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

let client: SupabaseClient<Database> | undefined;

/** Browser Supabase client (logged-in user, RLS applies). Used for realtime and uploads. */
export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
  }
  return client;
}
