// Converts between <input type="datetime-local"> values – wall-clock time in
// Europe/Copenhagen – and ISO timestamps (UTC), including summer time:
// - a time that does not exist (the hour skipped on the last Sunday of March)
//   moves forward by one hour, like clocks do,
// - a time that occurs twice (the repeated hour on the last Sunday of October)
//   means the first occurrence (summer time).
// Pure functions without I/O (tests/profile/datetime.test.ts).

import { TIME_ZONE } from "@/lib/format";

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallClock(instant: number): WallClock {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Copenhagen's offset from UTC at an instant in milliseconds (1 hour in winter, 2 in summer). */
function offsetAt(instant: number): number {
  const whole = Math.floor(instant / 1000) * 1000;
  const w = wallClock(whole);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - whole;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/**
 * "2026-10-30T14:05" (Copenhagen time) → "2026-10-30T13:05:00.000Z".
 * Returns null for anything that is not a real date and time.
 */
export function copenhagenLocalToIso(value: string | null | undefined): string | null {
  const match = LOCAL_PATTERN.exec((value ?? "").trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = [match[1], match[2], match[3], match[4], match[5], match[6] ?? "0"].map(Number);
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;

  // The wall-clock time written as if it were UTC.
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null; // e.g. 31 February

  // Around a DST change the offset differs before and after; try both.
  const before = offsetAt(wall - TWELVE_HOURS);
  const after = offsetAt(wall + TWELVE_HOURS);
  const candidates = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((instant) => instant + offsetAt(instant) === wall)
    .sort((a, b) => a - b);

  // No candidate: the time falls in the skipped hour – use the offset before the change.
  const instant = candidates[0] ?? wall - before;
  return new Date(instant).toISOString();
}

/** ISO timestamp → "2026-10-30T14:05" in Copenhagen time, for a datetime-local input ("" when empty/invalid). */
export function isoToCopenhagenLocal(value: string | null | undefined): string {
  if (!value) return "";
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) return "";
  const w = wallClock(instant);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** True when the timestamp lies in the future (used for "planlagt" announcements). */
export function isInFuture(value: string | null | undefined, now: Date = new Date()): boolean {
  if (!value) return false;
  const instant = Date.parse(value);
  return !Number.isNaN(instant) && instant > now.getTime();
}
