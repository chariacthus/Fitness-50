import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatMessageTime } from "@/lib/format";
import { EVENT_STATUS, eventTypeLabel, statusInfo } from "@/lib/payments/labels";
import { createClient } from "@/lib/supabase/server";
import { safeInternalLink } from "@/lib/training/display";
import { memberDisplayName } from "@/lib/admin/members";
import { markAdminNotificationsRead } from "@/lib/admin/overview-actions";
import { OVERVIEW_FIGURES, parseOverviewStats } from "@/lib/admin/overview";
import { loadNames } from "@/lib/admin/queries";
import { ActionForm } from "@/components/admin/action-form";
import { FiguresRow } from "@/components/admin/figures";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overblik" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin("/admin");
  const supabase = await createClient();

  const [statsRes, eventsRes, notificationsRes] = await Promise.all([
    supabase.rpc("admin_overview_stats"),
    supabase
      .from("payment_events")
      .select("id, event_type, status, received_at, user_id")
      .order("received_at", { ascending: false })
      .limit(8),
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at")
      .eq("user_id", admin.userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stats = parseOverviewStats(statsRes.data);
  const events = eventsRes.data ?? [];
  const notifications = notificationsRes.data ?? [];
  const names = await loadNames(
    supabase,
    events.map((e) => e.user_id),
  );
  const firstName = admin.profile.full_name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-12">
      <PageHeader
        title={firstName ? `Overblik – velkommen, ${firstName}` : "Overblik"}
        description="Her kan du se, hvad der venter på dig. Tallene er hentet direkte fra databasen."
        actions={
          <>
            <ButtonLink href="/admin/traeningsplaner/ny">Ny træningsplan</ButtonLink>
            <ButtonLink href="/admin/opslag/ny" variant="secondary">
              Nyt opslag
            </ButtonLink>
          </>
        }
      />

      <section aria-labelledby="tal-titel" className="space-y-4">
        <SectionTitle id="tal-titel">Lige nu</SectionTitle>
        {statsRes.error ? (
          <Alert tone="danger">Tallene kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
        ) : (
          <FiguresRow
            label="Nøgletal"
            figures={OVERVIEW_FIGURES.map((f) => ({ label: f.label, href: f.href, value: stats[f.key], needsAttention: f.needsAttention }))}
          />
        )}
      </section>

      <section aria-labelledby="notifikationer-titel" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle id="notifikationer-titel">
            Ulæste notifikationer{stats.unread_notifications > 0 ? ` (${stats.unread_notifications})` : ""}
          </SectionTitle>
          {notifications.length > 1 ? (
            <ActionForm action={markAdminNotificationsRead} hidden={{ all: "true" }} className="space-y-2">
              <SubmitButton variant="secondary" size="sm" pendingText="Markerer…">
                Markér alle som læst
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
        {notificationsRes.error ? (
          <Alert tone="danger">Notifikationerne kunne ikke hentes lige nu.</Alert>
        ) : notifications.length === 0 ? (
          <EmptyState title="Ingen ulæste notifikationer">Du får besked her, når der sker noget nyt.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {notifications.map((n) => {
              const link = safeInternalLink(n.link);
              return (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold">{n.title}</p>
                    {n.body ? <p>{n.body}</p> : null}
                    <p className="text-ink-soft">{formatMessageTime(n.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {link ? (
                      <ButtonLink href={link} variant="ghost" size="sm">
                        Åbn<span className="sr-only">: {n.title}</span>
                      </ButtonLink>
                    ) : null}
                    <ActionForm action={markAdminNotificationsRead} hidden={{ id: n.id }} className="space-y-2">
                      <SubmitButton variant="secondary" size="sm" pendingText="Markerer…">
                        Markér som læst<span className="sr-only">: {n.title}</span>
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="betalinger-titel" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle id="betalinger-titel">Seneste betalingshændelser</SectionTitle>
          <Link href="/admin/betalinger" className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
            Se alle betalinger
          </Link>
        </div>
        {eventsRes.error ? (
          <Alert tone="danger">Betalingshændelserne kunne ikke hentes lige nu.</Alert>
        ) : events.length === 0 ? (
          <EmptyState title="Ingen betalingshændelser endnu">Når Stripe sender besked om betalinger og abonnementer, vises de her.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {events.map((e) => {
              const status = statusInfo(EVENT_STATUS, e.status);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="space-y-1">
                    <p className="font-semibold">{eventTypeLabel(e.event_type)}</p>
                    <p className="text-ink-soft">
                      {formatMessageTime(e.received_at)}
                      {e.user_id ? ` · ${memberDisplayName(names.get(e.user_id))}` : ""}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
