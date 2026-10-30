import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { BucketName } from "@/lib/storage";

/**
 * Removes every stored object in one folder of a bucket ("<folder>/<file>"),
 * page by page. Returns false if listing or removing failed, or if nothing
 * could be removed (storage policies silently skip objects you may not delete).
 */
export async function removeStorageFolder(supabase: SupabaseClient<Database>, bucket: BucketName, folder: string): Promise<boolean> {
  for (let round = 0; round < 20; round += 1) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) return false;
    const files = (data ?? []).filter((f) => f.name && f.id !== null).map((f) => `${folder}/${f.name}`);
    if (files.length === 0) return true;
    const { data: removed, error: removeError } = await supabase.storage.from(bucket).remove(files);
    if (removeError || (removed ?? []).length === 0) return false;
  }
  return false;
}
