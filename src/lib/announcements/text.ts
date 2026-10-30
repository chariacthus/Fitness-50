// Text helpers for announcements (pure, tested in tests/profile/text.test.ts).

/** Splits a body into paragraphs on blank lines. Single line breaks stay inside a paragraph. */
export function paragraphs(body: string | null | undefined): string[] {
  return (body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\n+|\s+$/g, ""))
    .filter((p) => p.trim().length > 0);
}

/** Short one-line preview of a body for lists. */
export function excerpt(body: string | null | undefined, max = 200): string {
  const clean = (body ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:–-]+$/, "")}…`;
}

/** True for an absolute https:// link (the database only accepts those for map links). */
export function isHttpsLink(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Moves one id a step up or down in an ordered list. Returns the new order,
 * or null when the move is not possible (unknown id, already first/last).
 */
export function moveInOrder(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
