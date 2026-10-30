// Pure display helpers for Min profil (tested in tests/profile/display.test.ts).

import { todayInCopenhagen } from "@/lib/format";

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  diners: "Diners Club",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
  eftpos_au: "eftpos",
  interac: "Interac",
};

export type CardDetails = {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
};

/** "Visa •••• 4242, udløber 12/2028". Only brand, last four digits and expiry are ever shown. */
export function formatCard(card: CardDetails): string {
  const brand = (card.brand && CARD_BRANDS[card.brand.toLowerCase()]) || "Betalingskort";
  const last4 = card.last4 && /^\d{4}$/.test(card.last4) ? ` •••• ${card.last4}` : "";
  const hasExpiry =
    typeof card.exp_month === "number" && card.exp_month >= 1 && card.exp_month <= 12 && typeof card.exp_year === "number" && card.exp_year > 0;
  const expiry = hasExpiry ? `, udløber ${String(card.exp_month).padStart(2, "0")}/${card.exp_year}` : "";
  return `${brand}${last4}${expiry}`;
}

/** Danish name for a non-card payment method type from Stripe. */
export function paymentMethodLabel(type: string | null | undefined): string {
  if (type === "mobilepay") return "MobilePay";
  if (type === "link") return "Link (gemt hos Stripe)";
  return "Betalingsmetode gemt hos Stripe";
}

/** "staerk50-data-2026-10-30.json" (date in Copenhagen). */
export function exportFileName(now: Date = new Date()): string {
  return `staerk50-data-${todayInCopenhagen(now)}.json`;
}

export const CONTACT_PREFERENCES = [
  { value: "email", label: "E-mail" },
  { value: "telefon", label: "Telefon" },
  { value: "beskeder", label: "Beskeder her på siden" },
] as const;

export const DATA_REQUEST_TYPES: Record<string, string> = {
  deletion: "Sletning af konto",
  export: "Udtræk af data",
};

export const DATA_REQUEST_STATUSES: Record<string, { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  pending: { label: "Venter", tone: "warning" },
  completed: { label: "Gennemført", tone: "success" },
  rejected: { label: "Afvist", tone: "danger" },
  canceled: { label: "Annulleret af medlemmet", tone: "neutral" },
};

/** Pending requests first, then newest first. */
export function sortDataRequests<T extends { status: string; created_at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
