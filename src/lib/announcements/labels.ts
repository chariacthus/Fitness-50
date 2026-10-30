// Danish status texts for announcements (pure, tested in tests/profile/announcement-labels.test.ts).

import { formatDateTime } from "@/lib/format";
import { isInFuture } from "@/lib/announcements/datetime";

export type AnnouncementStatusInfo = { label: string; tone: "neutral" | "success" | "info" };

/** Kladde / Planlagt / Udgivet. */
export function announcementStatus(status: string, publishedAt: string | null, now: Date = new Date()): AnnouncementStatusInfo {
  if (status !== "published") return { label: "Kladde", tone: "neutral" };
  if (isInFuture(publishedAt, now)) return { label: "Planlagt", tone: "info" };
  return { label: "Udgivet", tone: "success" };
}

/** The message shown after "Udgiv", describing what really happened. */
export function publishOutcomeMessage({
  notified,
  isImportant,
  publishedAt,
  alreadyNotified,
  now = new Date(),
}: {
  notified: number;
  isImportant: boolean;
  publishedAt: string | null;
  /** Members were notified about this announcement at an earlier publication. */
  alreadyNotified: boolean;
  now?: Date;
}): string {
  if (publishedAt && isInFuture(publishedAt, now)) {
    const base = `Opslaget er udgivet og bliver synligt for medlemmerne ${formatDateTime(publishedAt)}.`;
    return isImportant && !alreadyNotified
      ? `${base} Bemærk: Der sendes ikke notifikation, når tidspunktet kommer. Skal medlemmerne have besked, så afpublicér opslaget, tøm feltet “Udgivelsestidspunkt”, og udgiv det igen.`
      : base;
  }
  if (notified > 0) {
    return `Opslaget er udgivet. ${notified === 1 ? "1 medlem har" : `${notified} medlemmer har`} fået en notifikation.`;
  }
  if (isImportant && alreadyNotified) {
    return "Opslaget er udgivet igen. Medlemmerne fik besked første gang, så der er ikke sendt en ny notifikation.";
  }
  if (isImportant) return "Opslaget er udgivet. Der var ingen aktive medlemmer at sende en notifikation til.";
  return "Opslaget er udgivet. Det er ikke markeret som vigtigt, så der er ikke sendt notifikationer.";
}
