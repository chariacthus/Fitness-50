import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { isoToCopenhagenLocal } from "@/lib/announcements/datetime";
import { announcementStatus } from "@/lib/announcements/labels";
import { loadAnnouncementMedia, type AnnouncementMediaItem } from "@/lib/announcements/queries";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAnnouncement, moveAnnouncementMedia, removeAnnouncementMedia } from "./actions";
import { AnnouncementEditorForm } from "./editor-form";
import { AnnouncementMediaUpload, MediaTitleForm } from "./media-upload";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Redigér opslag" };

function MediaPreview({ item, index }: { item: AnnouncementMediaItem; index: number }) {
  if (!item.url) {
    return <p className="rounded-md bg-muted p-4 text-ink-soft">Forhåndsvisningen kunne ikke hentes lige nu.</p>;
  }
  if (item.kind === "video") {
    return (
      <video controls playsInline preload="metadata" className="w-full rounded-md" src={item.url}>
        Din browser kan ikke afspille videoen.
      </video>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return <img src={item.url} alt={item.title || `Billede ${index + 1}`} className="h-auto w-full rounded-md object-cover" />;
}

function MediaList({ announcementId, items }: { announcementId: string; items: AnnouncementMediaItem[] }) {
  return (
    <ol className="space-y-6">
      {items.map((item, index) => {
        const name = item.kind === "video" ? `Video ${index + 1}` : `Billede ${index + 1}`;
        const ref = { announcementId, mediaId: item.id };
        return (
          <li key={item.id} className="grid gap-5 rounded-lg border border-line p-4 md:grid-cols-[minmax(0,18rem)_1fr]">
            <div className="space-y-2">
              <MediaPreview item={item} index={index} />
              <p className="text-ink-soft">
                {name}
                {item.sizeBytes ? ` · ${formatFileSize(item.sizeBytes)}` : ""}
              </p>
            </div>
            <div className="space-y-5">
              {item.kind === "image" ? (
                <MediaTitleForm announcementId={announcementId} mediaId={item.id} title={item.title} label={`Beskrivelse af ${name.toLowerCase()}`} />
              ) : (
                <p className="text-ink-soft">Videoens titel og beskrivelse skriver du i feltet “Video” ovenfor.</p>
              )}
              <div className="flex flex-wrap items-start gap-3">
                {index > 0 ? (
                  <InlineActionForm action={moveAnnouncementMedia} hidden={{ ...ref, direction: "up" }} pendingText="Flytter…">
                    <SubmitButton variant="secondary" size="sm" pendingText="Flytter…">
                      Flyt op<span className="sr-only">: {name}</span>
                    </SubmitButton>
                  </InlineActionForm>
                ) : null}
                {index < items.length - 1 ? (
                  <InlineActionForm action={moveAnnouncementMedia} hidden={{ ...ref, direction: "down" }} pendingText="Flytter…">
                    <SubmitButton variant="secondary" size="sm" pendingText="Flytter…">
                      Flyt ned<span className="sr-only">: {name}</span>
                    </SubmitButton>
                  </InlineActionForm>
                ) : null}
                <InlineActionForm action={removeAnnouncementMedia} hidden={ref} pendingText="Fjerner…">
                  <ConfirmButton
                    title={`Fjern ${name.toLowerCase()}?`}
                    description="Filen fjernes fra opslaget og slettes. Det kan ikke fortrydes."
                    confirmLabel="Ja, fjern den"
                  >
                    Fjern<span className="sr-only">: {name}</span>
                  </ConfirmButton>
                </InlineActionForm>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function AnnouncementEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/opslag/${id}`);
  if (!z.guid().safeParse(id).success) notFound();
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: announcement, error }, media] = await Promise.all([
    supabase.from("announcements").select("*").eq("id", id).maybeSingle(),
    loadAnnouncementMedia(supabase, id),
  ]);
  if (error) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader title="Redigér opslag" back={{ href: "/admin/opslag", label: "Tilbage til opslag" }} />
        <Alert tone="danger">Opslaget kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </div>
    );
  }
  if (!announcement) notFound();

  const status = announcementStatus(announcement.status, announcement.published_at);

  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader
        title="Redigér opslag"
        back={{ href: "/admin/opslag", label: "Tilbage til opslag" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {announcement.is_pinned ? <Badge tone="brand">Fastgjort</Badge> : null}
            {announcement.is_important ? <Badge tone="warning">Vigtigt</Badge> : null}
            {announcement.notified_at ? <span>Medlemmerne fik notifikation {formatDateTime(announcement.notified_at)}.</span> : null}
          </span>
        }
        actions={
          <ButtonLink href={`/opslag/${announcement.id}`} variant="secondary">
            Forhåndsvis
          </ButtonLink>
        }
      />

      {sp.oprettet === "1" ? (
        <Alert tone="success" title="Kladden er oprettet">
          Skriv videre, tilføj billeder eller video, og udgiv opslaget, når det er klar.
        </Alert>
      ) : null}

      <Panel>
        <AnnouncementEditorForm
          announcement={{
            id: announcement.id,
            status: announcement.status,
            title: announcement.title,
            body: announcement.body,
            video_title: announcement.video_title,
            video_description: announcement.video_description,
            location_name: announcement.location_name,
            location_address: announcement.location_address,
            map_url: announcement.map_url,
            is_pinned: announcement.is_pinned,
            is_important: announcement.is_important,
            published_at_local: isoToCopenhagenLocal(announcement.published_at),
          }}
        />
      </Panel>

      <section aria-labelledby="medier-titel" className="space-y-6">
        <SectionTitle id="medier-titel">Billeder og video</SectionTitle>
        <p className="max-w-prose text-ink-soft">
          Filerne gemmes med det samme og vises i den rækkefølge, du ser her. Det første billede bruges også som lille billede på
          opslagstavlen.
        </p>
        <Panel>
          <AnnouncementMediaUpload announcementId={announcement.id} />
        </Panel>
        {media.error ? (
          <Alert tone="danger">Billeder og videoer kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
        ) : media.items.length === 0 ? (
          <p className="text-ink-soft">Der er ingen billeder eller videoer på opslaget endnu.</p>
        ) : (
          <MediaList announcementId={announcement.id} items={media.items} />
        )}
      </section>

      <section aria-labelledby="slet-titel" className="space-y-4 border-t border-line pt-8">
        <SectionTitle id="slet-titel">Slet opslaget</SectionTitle>
        <p className="max-w-prose text-ink-soft">Opslaget og alle dets billeder og videoer slettes for altid. Medlemmerne kan ikke længere se det.</p>
        <InlineActionForm action={deleteAnnouncement} hidden={{ id: announcement.id }} pendingText="Sletter opslaget…">
          <ConfirmButton
            title="Slet opslaget?"
            description={`“${announcement.title}” og alle dets billeder og videoer bliver slettet. Det kan ikke fortrydes.`}
            confirmLabel="Ja, slet opslaget"
          >
            Slet opslag
          </ConfirmButton>
        </InlineActionForm>
      </section>
    </div>
  );
}
