import { formatDate, todayInCopenhagen } from "@/lib/format";

// Calendar-week logic for training completions. Weeks run Monday–Sunday in
// Europe/Copenhagen. workout_completions.completed_on is already a Copenhagen
// calendar date (YYYY-MM-DD), so everything here works on plain dates and is
// unaffected by daylight saving time.

export type WeekRange = { start: string; end: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(iso: string) {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Ugyldig dato: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Monday–Sunday week (Copenhagen) that contains `now`. */
export function copenhagenWeek(now: Date = new Date()): WeekRange {
  const today = todayInCopenhagen(now);
  const mondayOffset = (toUtcDate(today).getUTCDay() + 6) % 7;
  const start = addDays(today, -mondayOffset);
  return { start, end: addDays(start, 6) };
}

export function isInWeek(day: string, week: WeekRange) {
  return day >= week.start && day <= week.end;
}

/** "28. oktober 2026" for a YYYY-MM-DD calendar date. */
export function formatDay(iso: string) {
  // Noon UTC is the same calendar day in Copenhagen all year round.
  return formatDate(`${iso}T12:00:00Z`);
}

export type SessionOrder = { id: string; position: number; created_at?: string | null };
export type CompletionRow = { session_id: string; completed_on: string };

/** Plan order: position, then creation time. */
export function sortSessions<T extends SessionOrder>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => a.position - b.position || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/** First session in plan order that has not been completed during `week`, or null when all are done. */
export function nextSuggestedSession<T extends SessionOrder>(
  sessions: readonly T[],
  completions: readonly CompletionRow[],
  week: WeekRange,
): T | null {
  const doneThisWeek = new Set(completions.filter((c) => isInWeek(c.completed_on, week)).map((c) => c.session_id));
  return sortSessions(sessions).find((s) => !doneThisWeek.has(s.id)) ?? null;
}

export type CompletionSummary = {
  /** Number of completions registered this week. */
  thisWeek: number;
  /** Most recent completion date (YYYY-MM-DD) for any session. */
  lastCompletedOn: string | null;
  completedToday: Set<string>;
  lastBySession: Map<string, string>;
};

export function summarizeCompletions(completions: readonly CompletionRow[], week: WeekRange, today: string): CompletionSummary {
  const completedToday = new Set<string>();
  const lastBySession = new Map<string, string>();
  let thisWeek = 0;
  let lastCompletedOn: string | null = null;
  for (const c of completions) {
    if (isInWeek(c.completed_on, week)) thisWeek++;
    if (c.completed_on === today) completedToday.add(c.session_id);
    const prev = lastBySession.get(c.session_id);
    if (!prev || c.completed_on > prev) lastBySession.set(c.session_id, c.completed_on);
    if (!lastCompletedOn || c.completed_on > lastCompletedOn) lastCompletedOn = c.completed_on;
  }
  return { thisWeek, lastCompletedOn, completedToday, lastBySession };
}

/** "1 træning" / "3 træninger" */
export function countWorkouts(n: number) {
  return `${n} ${n === 1 ? "træning" : "træninger"}`;
}
