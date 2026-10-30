// Danish labels for the administration area.

import type { BadgeTone } from "@/components/ui/badge";
import type { AlertTone } from "@/components/ui/alert";

export type PlanStatus = "draft" | "published" | "archived";

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: BadgeTone; banner: string; alert: AlertTone }> = {
  draft: { label: "Kladde", tone: "warning", banner: "Kladde – ikke synlig for medlemmet", alert: "warning" },
  published: { label: "Udgivet", tone: "success", banner: "Udgivet – synlig for medlemmet", alert: "success" },
  archived: { label: "Arkiveret", tone: "neutral", banner: "Arkiveret", alert: "info" },
};

export function planStatus(status: string) {
  return PLAN_STATUS[(status in PLAN_STATUS ? status : "draft") as PlanStatus];
}

/** ?status= values on the plan lists (Danish in the URL). */
export const PLAN_FILTERS = [
  { value: "", label: "Alle planer", status: null },
  { value: "kladder", label: "Kladder", status: "draft" },
  { value: "udgivne", label: "Udgivne", status: "published" },
  { value: "arkiverede", label: "Arkiverede", status: "archived" },
] as const satisfies readonly { value: string; label: string; status: PlanStatus | null }[];

export function planFilter(value: string) {
  return PLAN_FILTERS.find((f) => f.value === value) ?? PLAN_FILTERS[0];
}

/** profiles.onboarding_status */
export const PROFILE_ONBOARDING: Record<string, { label: string; tone: BadgeTone }> = {
  not_started: { label: "Ikke startet", tone: "neutral" },
  in_progress: { label: "Påbegyndt", tone: "warning" },
  submitted: { label: "Udfyldt", tone: "success" },
};

/** onboarding_submissions.status */
export const SUBMISSION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Påbegyndt – ikke sendt", tone: "neutral" },
  submitted: { label: "Ny – ikke gennemgået", tone: "warning" },
  reviewed: { label: "Gennemgået", tone: "success" },
};

export const REPORT_TARGET: Record<string, string> = {
  community_message: "Besked i fællesskabet",
  private_message: "Privat besked",
  profile: "Profil",
};

export const REPORT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "Åben", tone: "warning" },
  resolved: { label: "Løst", tone: "success" },
  dismissed: { label: "Afvist", tone: "neutral" },
};

export const MODERATION_ACTION: Record<string, string> = {
  hide_message: "Skjulte en besked i fællesskabet",
  unhide_message: "Viste en skjult besked igen",
  suspend_user: "Satte adgangen til fællesskabet på pause",
  restore_user: "Genåbnede adgangen til fællesskabet",
  resolve_report: "Markerede en anmeldelse som løst",
  dismiss_report: "Afviste en anmeldelse",
};

export const CONTACT_PREFERENCE: Record<string, string> = {
  beskeder: "Beskeder her på siden",
  email: "E-mail",
  telefon: "Telefon",
};

export function labelOr<T extends { label: string }>(map: Record<string, T>, key: string | null | undefined, fallback: NoInfer<T>): T {
  return (key && map[key]) || fallback;
}
