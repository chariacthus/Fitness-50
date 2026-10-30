// Pure helpers for the admin overview (rpc admin_overview_stats).

export const OVERVIEW_KEYS = [
  "total_members",
  "active",
  "canceling",
  "past_due",
  "pending",
  "new_onboarding",
  "plans_awaiting",
  "unanswered_conversations",
  "open_reports",
  "pending_data_requests",
  "unread_notifications",
  "nutrition_without_plan",
] as const;

export type OverviewKey = (typeof OVERVIEW_KEYS)[number];
export type OverviewStats = Record<OverviewKey, number>;

/** Reads the JSON from admin_overview_stats; anything missing or invalid becomes 0. */
export function parseOverviewStats(value: unknown): OverviewStats {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const stats = {} as OverviewStats;
  for (const key of OVERVIEW_KEYS) {
    const n = typeof raw[key] === "number" ? (raw[key] as number) : Number(raw[key]);
    stats[key] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }
  return stats;
}

export type OverviewFigure = {
  key: OverviewKey;
  label: string;
  href: string;
  /** Highlighted when above zero – something is waiting for Christian. */
  needsAttention?: boolean;
};

/** The figures row on /admin, in reading order. Every figure links to where it can be handled. */
export const OVERVIEW_FIGURES: OverviewFigure[] = [
  { key: "total_members", label: "Medlemmer i alt", href: "/admin/medlemmer" },
  { key: "active", label: "Aktive", href: "/admin/medlemmer?status=aktive" },
  { key: "canceling", label: "Opsagt, men stadig aktive", href: "/admin/medlemmer?status=opsagte" },
  { key: "past_due", label: "Betaling mislykkedes", href: "/admin/medlemmer?status=betaling", needsAttention: true },
  { key: "new_onboarding", label: "Nye onboardingskemaer", href: "/admin/onboarding", needsAttention: true },
  { key: "plans_awaiting", label: "Planer der venter", href: "/admin/traeningsplaner#venter", needsAttention: true },
  { key: "unanswered_conversations", label: "Ubesvarede samtaler", href: "/admin/beskeder", needsAttention: true },
  { key: "open_reports", label: "Åbne anmeldelser", href: "/admin/rapporter", needsAttention: true },
  { key: "pending_data_requests", label: "Dataanmodninger", href: "/admin/anmodninger", needsAttention: true },
  { key: "nutrition_without_plan", label: "Kostplaner der venter", href: "/admin/kostplaner#venter", needsAttention: true },
];
