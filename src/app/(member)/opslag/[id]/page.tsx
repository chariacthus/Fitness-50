import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireEntitledViewer } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { isInFuture } from "@/lib/announcements/datetime";
import { loadAnnouncementMedia } from "@/lib/announcements/queries";
import { AnnouncementContent } from "@/components/announcements/announcement-content";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Opslag" };

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireEntitledViewer(`/opslag/${id}`);
  if (!z.guid().safeParse(id).success) notFound();

  const [settings, supabase] = await Promise.all([getSiteSettings(), createClient()]);
  // RLS: members only get published announcements; administrators also see drafts (preview).
  const [{ data: announcement, error }, media] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body, status, published_at, is_pinned, video_title, video_description, location_name, location_address, map_url")
      .eq("id", id)
      .maybeSingle(),
    loadAnnouncementMedia(supabase, id),
  ]);

  if (error) {
    return (
      <>
        <PageHeader title="Opslag" back={{ href: "/opslag", label: "Alle opslag" }} />
        <Alert tone="danger">Opslaget kunne ikke hentes lige nu. Prøv at genindlæse siden om lidt.</Alert>
      </>
    );
  }
  if (!announcement) notFound();

  const isDraft = announcement.status !== "published";
  const isScheduled = !isDraft && isInFuture(announcement.published_at);

  return (
    <article>
      {isDraft || isScheduled ? (
        <Alert tone="warning" title={isDraft ? "Kladde" : "Planlagt"} className="mb-6">
          <p>
            {isDraft
              ? "Opslaget er ikke udgivet. Kun administratorer kan se det."
              : `Opslaget bliver synligt for medlemmerne ${formatDateTime(announcement.published_at ?? "")}. Indtil da kan kun administratorer se det.`}
          </p>
          {viewer.isAdmin ? (
            <div className="mt-3">
              <ButtonLink href={`/admin/opslag/${announcement.id}`} variant="secondary" size="sm">
                Tilbage til redigering
              </ButtonLink>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <PageHeader
        title={announcement.title}
        back={{ href: "/opslag", label: "Alle opslag" }}
        description={
          <span className="flex flex-wrap items-center gap-3">
            {announcement.published_at && !isDraft ? <span>Udgivet {formatDate(announcement.published_at)}</span> : null}
            {announcement.is_pinned ? <Badge tone="brand">Fastgjort</Badge> : null}
          </span>
        }
      />

      {media.error ? <Alert tone="warning" className="mb-6">Billeder og videoer kunne ikke hentes lige nu.</Alert> : null}
      <AnnouncementContent announcement={announcement} media={media.items} coachName={settings.coach_name} />
    </article>
  );
}
