import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limit stored in Postgres. Returns true when allowed.
 * Fails open only if the database is unreachable (the action will fail anyway).
 */
export async function checkRateLimit(key: string, max: number, windowSeconds: number) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return Boolean(data);
}

/** Best-effort client IP for rate limiting anonymous endpoints. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
