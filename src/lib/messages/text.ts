// Small text helpers shared by the community chat, private messages and
// notifications. Pure functions – safe in server and client code.

/** The name shown for a person. Empty names fall back to a neutral label. */
export function displayName(fullName: string | null | undefined, fallback = "Medlem") {
  const trimmed = (fullName ?? "").trim();
  return trimmed || fallback;
}

/** Collapses whitespace and shortens text at a word boundary ("…"). */
export function messageSnippet(text: string | null | undefined, max = 120) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?–-]+$/, "")}…`;
}

/** "1 ny besked" / "3 nye beskeder". */
export function newMessagesLabel(count: number) {
  return count === 1 ? "1 ny besked" : `${count} nye beskeder`;
}

/** "1 ældre besked er hentet" / "12 ældre beskeder er hentet". */
export function olderMessagesLabel(count: number) {
  if (count === 0) return "Der er ikke flere ældre beskeder.";
  return count === 1 ? "1 ældre besked er hentet." : `${count} ældre beskeder er hentet.`;
}

export const MESSAGE_MAX_LENGTH = 4000;
