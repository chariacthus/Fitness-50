import "server-only";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Server-side helpers for the auth actions.

/** Absolute URL Supabase puts in its emails: /auth/confirm?next=… on this site. */
export function confirmRedirectUrl(next: string): string {
  return `${publicEnv.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`;
}

/**
 * Checks every rate-limit bucket; returns false if one of them is exhausted.
 * Fails open if the limiter itself cannot run (e.g. missing service key), so a
 * configuration problem never locks everybody out – Supabase Auth has its own limits too.
 */
export async function withinRateLimits(buckets: { key: string; max: number; windowSeconds: number }[]): Promise<boolean> {
  try {
    const results = await Promise.all(buckets.map((b) => checkRateLimit(b.key, b.max, b.windowSeconds)));
    return results.every(Boolean);
  } catch (error) {
    console.error("[auth] rate limit check failed", error);
    return true;
  }
}

/**
 * Removes the Supabase session cookies on this device. Used as a fallback when
 * signOut() could not reach Supabase, so "Log ud" always logs out locally.
 */
export async function clearAuthCookies() {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name.startsWith("sb-") && name.includes("-auth-token")) store.delete(name);
  }
}

export { clientIp };
