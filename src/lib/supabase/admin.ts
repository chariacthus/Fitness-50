import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Privileged Supabase client (bypasses Row Level Security).
 * ONLY for trusted server code: payment webhooks, notifications, contact form,
 * and admin operations after `requireAdmin()` has been checked.
 * Never pass its results to the browser without filtering.
 */
export function createAdminClient() {
  if (!serverEnv.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY mangler – den privilegerede klient kan ikke oprettes.");
  }
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
