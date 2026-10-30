// Pure helpers for the community chat: day groups, the "Nye beskeder"
// divider and reply quotes.

import { TIME_ZONE } from "@/lib/format";
import { messageSnippet } from "@/lib/messages/text";

/** YYYY-MM-DD in Copenhagen time. */
export function copenhagenDayKey(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).format(d);
}

/** "I dag", "I går" or "Torsdag 29. oktober" (year added when it is not this year). */
export function dayHeading(dayKey: string, now: Date = new Date()) {
  if (dayKey === copenhagenDayKey(now)) return "I dag";
  if (dayKey === copenhagenDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "I går";
  // Noon UTC is the same calendar day in Copenhagen all year round.
  const date = new Date(`${dayKey}T12:00:00Z`);
  const sameYear = dayKey.slice(0, 4) === copenhagenDayKey(now).slice(0, 4);
  // Built from parts so the result does not depend on the browser's ICU version.
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("da-DK", { ...options, timeZone: TIME_ZONE }).format(date);
  const weekday = part({ weekday: "long" });
  const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${Number(dayKey.slice(8, 10))}. ${part({ month: "long" })}`;
  return sameYear ? label : `${label} ${dayKey.slice(0, 4)}`;
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

/** Groups chronologically sorted messages into consecutive Copenhagen days. */
export function groupByDay<T extends { created_at: string }>(messages: readonly T[], now: Date = new Date()): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const message of messages) {
    const key = copenhagenDayKey(message.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(message);
    else groups.push({ key, label: dayHeading(key, now), items: [message] });
  }
  return groups;
}

/**
 * Id of the first message written by someone else after the viewer last read
 * the chat – where the "Nye beskeder" divider goes. Null when nothing is new
 * or the viewer has never opened the chat before.
 */
export function firstUnreadId<T extends { id: string; created_at: string; author_id: string | null; deleted_at?: string | null }>(
  messages: readonly T[],
  lastReadAt: string | null | undefined,
  viewerId: string,
) {
  if (!lastReadAt) return null;
  const readTime = Date.parse(lastReadAt);
  if (Number.isNaN(readTime)) return null;
  const first = messages.find(
    (m) => Date.parse(m.created_at) > readTime && m.author_id !== viewerId && !m.deleted_at,
  );
  return first?.id ?? null;
}

/** Text shown in a reply quote for the message being answered. */
export function replyQuoteText(target: { body: string; image_path: string | null; deleted_at: string | null } | null | undefined) {
  if (!target) return "En tidligere besked";
  if (target.deleted_at) return "Beskeden er slettet";
  const text = messageSnippet(target.body, 100);
  if (text) return text;
  return target.image_path ? "Et billede" : "En tidligere besked";
}
