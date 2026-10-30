// Membership states are computed in the database (public._membership_state)
// from verified provider data. This file only maps them to Danish UI text.

export const MEMBERSHIP_STATES = [
  "none",
  "pending",
  "active",
  "canceling",
  "past_due_grace",
  "past_due",
  "expired",
  "admin",
] as const;

export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const ENTITLED_STATES: readonly MembershipState[] = ["active", "canceling", "past_due_grace", "admin"];

export function toMembershipState(value: unknown): MembershipState {
  return MEMBERSHIP_STATES.includes(value as MembershipState) ? (value as MembershipState) : "none";
}

export function isEntitledState(state: MembershipState) {
  return ENTITLED_STATES.includes(state);
}

export const MEMBERSHIP_LABELS: Record<MembershipState, string> = {
  none: "Intet medlemskab",
  pending: "Afventer betaling",
  active: "Aktiv",
  canceling: "Opsagt – aktiv til periodens udløb",
  past_due_grace: "Betaling mislykkedes",
  past_due: "Betaling mislykkedes – adgang sat på pause",
  expired: "Udløbet",
  admin: "Administrator",
};

export type MembershipTone = "success" | "warning" | "danger" | "neutral";

export const MEMBERSHIP_TONES: Record<MembershipState, MembershipTone> = {
  none: "neutral",
  pending: "warning",
  active: "success",
  canceling: "warning",
  past_due_grace: "danger",
  past_due: "danger",
  expired: "neutral",
  admin: "success",
};

/** Shape returned by the `membership_summary` RPC. */
export type MembershipSummary = {
  state: MembershipState;
  subscription_id?: string;
  provider?: "stripe" | "mobilepay";
  status?: string;
  product_name?: string | null;
  amount?: number | null;
  billing_interval?: string | null;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  access_until?: string | null;
  grace_until?: string | null;
};

export function parseMembershipSummary(value: unknown): MembershipSummary {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { ...(raw as Omit<MembershipSummary, "state">), state: toMembershipState(raw.state) };
}
