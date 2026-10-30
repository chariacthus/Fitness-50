// Danish formatting helpers. All dates are shown in Europe/Copenhagen time.

export const TIME_ZONE = "Europe/Copenhagen";
const LOCALE = "da-DK";

function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value);
}

/** 30. oktober 2026 */
export function formatDate(value: string | number | Date) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }).format(
    toDate(value),
  );
}

/** 30.10.2026 */
export function formatShortDate(value: string | number | Date) {
  return new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TIME_ZONE }).format(
    toDate(value),
  );
}

/** 30. oktober 2026 kl. 14.05 */
export function formatDateTime(value: string | number | Date) {
  const d = toDate(value);
  const date = formatDate(d);
  const time = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(d);
  return `${date} kl. ${time}`;
}

/** 14.05 */
export function formatTime(value: string | number | Date) {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(toDate(value));
}

/** "i dag kl. 14.05", "i går kl. 09.12" or "3. oktober kl. 10.00" – for message lists. */
export function formatMessageTime(value: string | number | Date, now: Date = new Date()) {
  const d = toDate(value);
  const dayKey = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).format(x);
  const time = formatTime(d);
  if (dayKey(d) === dayKey(now)) return `i dag kl. ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey(d) === dayKey(yesterday)) return `i går kl. ${time}`;
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  const date = new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: TIME_ZONE,
  }).format(d);
  return `${date} kl. ${time}`;
}

/** Amount in øre → "299,00 kr." */
export function formatDKK(amountInOre: number | null | undefined) {
  if (amountInOre == null) return "Pris ikke fastsat";
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "DKK" }).format(amountInOre / 100);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export const INTERVAL_LABELS: Record<string, string> = {
  one_time: "engangsbetaling",
  month: "pr. måned",
  quarter: "pr. kvartal",
  year: "pr. år",
};

export function formatInterval(interval: string | null | undefined) {
  return interval ? (INTERVAL_LABELS[interval] ?? interval) : "";
}

/** Today's date in Copenhagen as YYYY-MM-DD. */
export function todayInCopenhagen(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).format(now);
}

export function firstName(fullName: string | null | undefined) {
  const trimmed = (fullName ?? "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "";
}
