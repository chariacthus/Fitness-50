import type { Metadata } from "next";
import { requireEntitledViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { BUCKETS } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementListItem, type AnnouncementListEntry } from "@/components/announcements/announcement-list-item";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Opslag" };

export default async function AnnouncementsPage() {
  await requireEntitledViewer("/opslag");
  const [settings, supabase] = await Promise.all([getSiteSettings(), createClient()]);

  // RLS only returns published announcements to members; the filters also keep
  // drafts out of the administrator's view of the wall.
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, published_at, is_pinned, announcement_media(position, media(path, kind))")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];
  const firstImages = rows.map((row) => {
    const media = [...(row.announcement_media ?? [])].sort((a, b) => a.position - b.position);
    return {
      id: row.id,
      image: media.find((m) => m.media?.kind === "image")?.media?.path ?? null,
      hasVideo: media.some((m) => m.media?.kind === "video"),
    };
  });
  const urls = await signedUrls(
    supabase,
    BUCKETS.announcements,
    firstImages.map((f) => f.image),
  );
  const entries: AnnouncementListEntry[] = rows.map((row, i) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    published_at: row.published_at,
    is_pinned: row.is_pinned,
    hasVideo: firstImages[i].hasVideo,
    thumbnailUrl: firstImages[i].image ? (urls.get(firstImages[i].image) ?? null) : null,
  }));

  return (
    <>
      <PageHeader title="Opslag" description={`Nyheder, tips og fælles aftaler fra ${settings.coach_name}.`} />
      {error ? (
        <Alert tone="danger">Opslagene kunne ikke hentes lige nu. Prøv at genindlæse siden om lidt.</Alert>
      ) : entries.length === 0 ? (
        <EmptyState title="Der er ingen opslag endnu">Når {settings.coach_name} skriver et opslag, kan du læse det her.</EmptyState>
      ) : (
        <ul className="space-y-6">
          {entries.map((entry) => (
            <li key={entry.id}>
              <AnnouncementListItem entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
