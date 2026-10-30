import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { BucketName } from "@/lib/storage";

const ONE_HOUR = 60 * 60;

/**
 * Signed URLs for private files. Pass the user's own client so storage RLS
 * decides access; pass the admin client only after an explicit permission check.
 * Returns a map path → url (missing entries mean "no access" or "not found").
 */
export async function signedUrls(
  supabase: SupabaseClient<Database>,
  bucket: BucketName,
  paths: (string | null | undefined)[],
  expiresIn = ONE_HOUR,
) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}

export async function signedUrl(
  supabase: SupabaseClient<Database>,
  bucket: BucketName,
  path: string | null | undefined,
  expiresIn = ONE_HOUR,
) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
