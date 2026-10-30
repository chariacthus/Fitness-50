import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { announcementStatus } from "@/lib/announcements/labels";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { setAnnouncementPinned } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Opslag" };

type Row = {
  id: string;
  title: string;
  status: string;
  is_pinned: boolean;
  is_important: boolean;
  published_at: string | null;
  notified_at: string | null;
  updated_at: string;
};

function AnnouncementRow({ row }: { row: Row }) {
  const status = announcementStatus(row.status, row.published_at);
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link href={`/admin/opslag/${row.id}`} className="text-lg font-semibold text-brand underline underline-offset-4">
            {row.title}
          </Link>
          <p className="text-ink-soft">
            {row.status === "published" && row.published_at
              ? `${status.label === "Planlagt" ? "Bliver synligt" : "Udgivet"} ${formatDateTime(row.published_at)}`
              : `Senest ændret ${formatShortDate(row.updated_at)}`}
            {row.notified_at ? " · Medlemmerne har fået notifikation" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {row.is_pinned ? <Badge tone="brand">Fastgjort</Badge> : null}
          {row.is_important ? <Badge tone="warning">Vigtigt</Badge> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <ButtonLink href={`/admin/opslag/${row.id}`} variant="secondary" size="sm">
          Redigér<span className="sr-only">: {row.title}</span>
        </ButtonLink>
        <InlineActionForm action={setAnnouncementPinned} hidden={{ id: row.id, pinned: row.is_pinned ? "false" : "true" }} pendingText="Gemmer…">
          <SubmitButton variant="ghost" size="sm" pendingText="Gemmer…">
            {row.is_pinned ? "Frigør" : "Fastgør"}
            <span className="sr-only">: {row.title}</span>
          </SubmitButton>
        </InlineActionForm>
      </div>
    </li>
  );
}

export default async function AdminAnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/opslag");
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, status, is_pinned, is_important, published_at, notified_at, updated_at")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("updated_at", { ascending: false })
    .limit(300);

  const rows = data ?? [];
  const drafts = rows.filter((r) => r.status !== "published");
  const published = rows.filter((r) => r.status === "published");
  const deleted = params.slettet;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Opslag"
        description="Opslag er beskeder fra dig til alle medlemmer – fx nyheder, træningstips eller en fælles træning. Medlemmerne kan læse dem, men ikke kommentere."
        actions={<ButtonLink href="/admin/opslag/ny">Nyt opslag</ButtonLink>}
      />

      {deleted === "1" ? <Alert tone="success" title="Opslaget er slettet">Opslaget og dets billeder og videoer er slettet.</Alert> : null}
      {deleted === "filer" ? (
        <Alert tone="warning" title="Opslaget er slettet">
          Opslaget er slettet, men nogle af dets filer kunne ikke fjernes fra lageret. De er ikke længere synlige for nogen.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger">Opslagene kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      ) : rows.length === 0 ? (
        <EmptyState title="Der er ingen opslag endnu" action={<ButtonLink href="/admin/opslag/ny">Skriv dit første opslag</ButtonLink>}>
          Et opslag gemmes først som kladde. Medlemmerne ser det, når du udgiver det.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="kladder-titel" className="space-y-4">
            <SectionTitle id="kladder-titel">Kladder ({drafts.length})</SectionTitle>
            {drafts.length === 0 ? (
              <p className="text-ink-soft">Du har ingen kladder.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {drafts.map((row) => (
                  <AnnouncementRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="udgivne-titel" className="space-y-4">
            <SectionTitle id="udgivne-titel">Udgivne ({published.length})</SectionTitle>
            {published.length === 0 ? (
              <p className="text-ink-soft">Du har ikke udgivet nogen opslag endnu.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {published.map((row) => (
                  <AnnouncementRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
