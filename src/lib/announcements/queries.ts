import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BUCKETS } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";

type Client = SupabaseClient<Database>;

export type AnnouncementMediaItem = {
  id: string;
  path: string;
  kind: "image" | "video";
  mimeType: string;
  title: string | null;
  sizeBytes: number | null;
  position: number;
  /** Short-lived signed URL, or null when it could not be created. */
  url: string | null;
};

/**
 * Media attached to an announcement, in display order, with signed URLs.
 * Uses the caller's client, so RLS decides what is visible (entitled members
 * see media of published announcements; administrators see everything).
 */
export async function loadAnnouncementMedia(
  supabase: Client,
  announcementId: string,
): Promise<{ items: AnnouncementMediaItem[]; error: boolean }> {
  const { data, error } = await supabase
    .from("announcement_media")
    .select("position, media(id, path, kind, mime_type, title, size_bytes)")
    .eq("announcement_id", announcementId)
    .order("position", { ascending: true });
  if (error) return { items: [], error: true };

  const rows = (data ?? []).flatMap((row) => (row.media ? [{ position: row.position, media: row.media }] : []));
  const urls = await signedUrls(
    supabase,
    BUCKETS.announcements,
    rows.map((r) => r.media.path),
  );
  return {
    error: false,
    items: rows.map(({ position, media }) => ({
      id: media.id,
      path: media.path,
      kind: media.kind === "video" ? "video" : "image",
      mimeType: media.mime_type,
      title: media.title,
      sizeBytes: media.size_bytes,
      position,
      url: urls.get(media.path) ?? null,
    })),
  };
}
