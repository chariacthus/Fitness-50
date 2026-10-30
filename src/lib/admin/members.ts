// Pure helpers for the admin member list (rows from rpc admin_member_list).

import { toMembershipState, type MembershipState } from "@/lib/membership";

export type AdminMemberRow = {
  id: string;
  full_name: string;
  email: string | null;
  avatar_path: string | null;
  created_at: string;
  membership_state: MembershipState;
  onboarding_status: string;
  has_published_plan: boolean;
  has_nutrition: boolean;
  community_suspended: boolean;
  is_admin: boolean;
};

type RawMemberRow = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  created_at: string | null;
  membership_state: string | null;
  onboarding_status: string | null;
  has_published_plan: boolean | null;
  has_nutrition: boolean | null;
  community_suspended: boolean | null;
  is_admin: boolean | null;
};

export function normalizeMemberRows(rows: readonly RawMemberRow[] | null | undefined): AdminMemberRow[] {
  return (rows ?? [])
    .filter((r): r is RawMemberRow & { id: string } => Boolean(r.id))
    .map((r) => ({
      id: r.id,
      full_name: (r.full_name ?? "").trim(),
      email: r.email,
      avatar_path: r.avatar_path,
      created_at: r.created_at ?? new Date(0).toISOString(),
      membership_state: toMembershipState(r.membership_state),
      onboarding_status: r.onboarding_status ?? "not_started",
      has_published_plan: Boolean(r.has_published_plan),
      has_nutrition: Boolean(r.has_nutrition),
      community_suspended: Boolean(r.community_suspended),
      is_admin: Boolean(r.is_admin),
    }));
}

/** ?status= filters on /admin/medlemmer (also used by the overview figures). */
export const MEMBER_FILTERS = [
  { value: "", label: "Alle", states: null },
  { value: "aktive", label: "Aktive", states: ["active"] },
  { value: "opsagte", label: "Opsagt, men stadig aktive", states: ["canceling"] },
  { value: "betaling", label: "Betaling mislykkedes", states: ["past_due_grace", "past_due"] },
  { value: "afventer", label: "Afventer betaling", states: ["pending"] },
  { value: "uden", label: "Uden medlemskab", states: ["none", "expired"] },
  { value: "administratorer", label: "Administratorer", states: ["admin"] },
] as const satisfies readonly { value: string; label: string; states: readonly MembershipState[] | null }[];

export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export function memberFilter(value: string): MemberFilter {
  return MEMBER_FILTERS.find((f) => f.value === value) ?? MEMBER_FILTERS[0];
}

export function filterMembers(rows: readonly AdminMemberRow[], filter: MemberFilter): AdminMemberRow[] {
  const states = filter.states as readonly MembershipState[] | null;
  return states ? rows.filter((r) => states.includes(r.membership_state)) : [...rows];
}

/** Paying members with access (administrators excluded). */
export function isEntitledMember(row: Pick<AdminMemberRow, "membership_state" | "is_admin">): boolean {
  return !row.is_admin && ["active", "canceling", "past_due_grace"].includes(row.membership_state);
}

/** Same rule as admin_overview_stats.plans_awaiting: access, questionnaire sent, no published plan. */
export function awaitsTrainingPlan(row: AdminMemberRow): boolean {
  return isEntitledMember(row) && row.onboarding_status === "submitted" && !row.has_published_plan;
}

export function memberDisplayName(name: string | null | undefined, fallback = "Medlem uden navn"): string {
  const trimmed = (name ?? "").trim();
  return trimmed || fallback;
}

/** Danish genitive: "Jens" → "Jens'", "Ole Hansen" → "Ole Hansens". */
export function genitive(name: string): string {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

/** Search text for rpc admin_member_list: trimmed, max 100 characters, wildcards removed. */
export function normalizeSearch(value: string): string {
  return value.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
