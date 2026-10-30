import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime, formatDKK, formatInterval } from "@/lib/format";
import { accessEndsAt } from "@/lib/payments/stripe-mapping";
import { EVENT_STATUS, PURCHASE_STATUS, SUBSCRIPTION_STATUS, eventTypeLabel, statusInfo } from "@/lib/payments/labels";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { RefundForm } from "./refund-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Betalinger" };

function MemberLink({ userId, names }: { userId: string | null; names: Map<string, string> }) {
  if (!userId) return <span className="text-ink-soft">Ukendt medlem</span>;
  return (
    <Link href={`/admin/medlemmer/${userId}`} className="font-semibold text-brand underline underline-offset-4">
      {names.get(userId) || "Medlem uden navn"}
    </Link>
  );
}

export default async function AdminPaymentsPage() {
  await requireAdmin("/admin/betalinger");
  const supabase = await createClient();

  const [events, subscriptions, purchases] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id, event_type, status, error, received_at, user_id, livemode")
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("subscriptions")
      .select("id, user_id, status, current_period_end, cancel_at_period_end, cancel_at, payment_failed_at, amount, billing_interval, provider, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("purchases")
      .select("id, user_id, status, amount, provider, provider_payment_intent_id, paid_at, refunded_at, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const userIds = new Set<string>();
  for (const row of events.data ?? []) if (row.user_id) userIds.add(row.user_id);
  for (const row of subscriptions.data ?? []) userIds.add(row.user_id);
  for (const row of purchases.data ?? []) userIds.add(row.user_id);
  const { data: profiles } = userIds.size
    ? await supabase.from("profiles").select("id, full_name").in("id", [...userIds])
    : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const loadFailed = events.error || subscriptions.error || purchases.error;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Betalinger"
        description="Abonnementer, køb og de seneste beskeder fra Stripe. Betalingsstatus ændres kun af bekræftede beskeder fra Stripe."
      />
      {loadFailed ? <Alert tone="danger">Nogle oplysninger kunne ikke hentes. Prøv at genindlæse siden.</Alert> : null}

      <section aria-labelledby="abonnementer-titel" className="space-y-4">
        <SectionTitle id="abonnementer-titel">Medlemskaber</SectionTitle>
        {subscriptions.data && subscriptions.data.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {subscriptions.data.map((sub) => {
              const status = statusInfo(SUBSCRIPTION_STATUS, sub.status);
              const running = ["active", "trialing", "past_due"].includes(sub.status);
              const canceling = running && Boolean(sub.cancel_at_period_end || sub.cancel_at);
              const periodDate = canceling ? accessEndsAt(sub) : sub.current_period_end;
              return (
                <li key={sub.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[2fr_3fr]">
                  <div className="space-y-1">
                    <MemberLink userId={sub.user_id} names={names} />
                    <p className="text-ink-soft">
                      {sub.amount != null ? `${formatDKK(sub.amount)} ${formatInterval(sub.billing_interval)}` : "Beløb ukendt"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="flex flex-wrap gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {canceling ? <Badge tone="warning">Opsagt</Badge> : null}
                    </p>
                    {running && periodDate ? (
                      <p>
                        {canceling ? "Adgang indtil" : "Næste fornyelse"}: {formatDate(periodDate)}
                      </p>
                    ) : null}
                    {sub.payment_failed_at ? (
                      <p className="font-semibold text-danger">Betaling mislykket siden {formatDate(sub.payment_failed_at)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Ingen medlemskaber endnu">Medlemskaber vises her, når Stripe har bekræftet en betaling.</EmptyState>
        )}
      </section>

      <section aria-labelledby="koeb-titel" className="space-y-4">
        <SectionTitle id="koeb-titel">Køb af tilkøb</SectionTitle>
        {purchases.data && purchases.data.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {purchases.data.map((purchase) => {
              const status = statusInfo(PURCHASE_STATUS, purchase.status);
              const productName = (purchase.products as { name: string } | null)?.name ?? "Tilkøb";
              const memberName = names.get(purchase.user_id) || "medlemmet";
              const refundable =
                purchase.provider === "stripe" && purchase.status === "paid" && Boolean(purchase.provider_payment_intent_id);
              return (
                <li key={purchase.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[2fr_2fr_1fr]">
                  <div className="space-y-1">
                    <MemberLink userId={purchase.user_id} names={names} />
                    <p className="text-ink-soft">
                      {productName} · {formatDKK(purchase.amount)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <p className="text-ink-soft">
                      {purchase.refunded_at
                        ? `Refunderet ${formatDate(purchase.refunded_at)}`
                        : purchase.paid_at
                          ? `Betalt ${formatDate(purchase.paid_at)}`
                          : `Oprettet ${formatDate(purchase.created_at)}`}
                      {purchase.provider === "manual" ? " · givet manuelt" : ""}
                    </p>
                  </div>
                  <div>
                    {refundable ? (
                      <RefundForm
                        purchaseId={purchase.id}
                        description={`${productName} til ${formatDKK(purchase.amount)} købt af ${memberName}.`}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Ingen køb endnu" />
        )}
      </section>

      <section aria-labelledby="haendelser-titel" className="space-y-4">
        <SectionTitle id="haendelser-titel">Seneste beskeder fra Stripe</SectionTitle>
        {events.data && events.data.length > 0 ? (
          <Panel className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {events.data.map((event) => {
                const status = statusInfo(EVENT_STATUS, event.status);
                return (
                  <li key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[3fr_1fr_2fr]">
                    <div className="space-y-1">
                      <p className="font-semibold">{eventTypeLabel(event.event_type)}</p>
                      {event.user_id ? <MemberLink userId={event.user_id} names={names} /> : null}
                      {event.livemode === false ? <p className="text-ink-soft">Testtilstand</p> : null}
                    </div>
                    <div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-ink-soft">{formatDateTime(event.received_at)}</p>
                      {event.error ? <p className="break-words text-danger">Fejl: {event.error}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : (
          <EmptyState title="Ingen beskeder fra Stripe endnu">
            Når webhooken er sat op i Stripe, vises hver besked her – også dem, der fejler.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
