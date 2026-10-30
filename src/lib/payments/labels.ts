// Danish labels for payment data shown in the admin area.

import type { BadgeTone } from "@/components/ui/badge";

const EVENT_LABELS: Record<string, string> = {
  "checkout.session.completed": "Betalingssiden er gennemført",
  "checkout.session.async_payment_succeeded": "Forsinket betaling er gennemført",
  "checkout.session.async_payment_failed": "Forsinket betaling mislykkedes",
  "checkout.session.expired": "Betalingssiden udløb uden betaling",
  "customer.subscription.created": "Abonnement oprettet",
  "customer.subscription.updated": "Abonnement ændret",
  "customer.subscription.deleted": "Abonnement afsluttet",
  "customer.subscription.paused": "Abonnement sat på pause",
  "customer.subscription.resumed": "Abonnement genoptaget",
  "invoice.paid": "Faktura betalt",
  "invoice.payment_failed": "Betaling af faktura mislykkedes",
  "charge.refunded": "Betaling refunderet",
};

export function eventTypeLabel(type: string) {
  return EVENT_LABELS[type] ?? `Anden hændelse (${type})`;
}

export const EVENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  received: { label: "Modtaget", tone: "info" },
  processed: { label: "Behandlet", tone: "success" },
  ignored: { label: "Ikke relevant", tone: "neutral" },
  failed: { label: "Fejlede", tone: "danger" },
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Aktiv", tone: "success" },
  trialing: { label: "Prøveperiode", tone: "success" },
  past_due: { label: "Betaling mislykkedes", tone: "danger" },
  unpaid: { label: "Ubetalt", tone: "danger" },
  canceled: { label: "Afsluttet", tone: "neutral" },
  incomplete: { label: "Afventer betaling", tone: "warning" },
  incomplete_expired: { label: "Betaling ikke gennemført", tone: "neutral" },
  paused: { label: "På pause", tone: "warning" },
};

export const PURCHASE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Afventer betaling", tone: "warning" },
  paid: { label: "Betalt", tone: "success" },
  failed: { label: "Mislykkedes", tone: "danger" },
  refunded: { label: "Refunderet", tone: "neutral" },
  granted: { label: "Givet af administrator", tone: "info" },
  canceled: { label: "Annulleret", tone: "neutral" },
};

export function statusInfo(map: Record<string, { label: string; tone: BadgeTone }>, status: string) {
  return map[status] ?? { label: status, tone: "neutral" as BadgeTone };
}

const RENEWAL_PHRASES: Record<string, string> = {
  month: "hver måned",
  quarter: "hvert kvartal",
  year: "hvert år",
};

/** "hver måned" / "hvert kvartal" / "hvert år". */
export function renewalPhrase(interval: string | null | undefined) {
  return interval ? (RENEWAL_PHRASES[interval] ?? null) : null;
}
