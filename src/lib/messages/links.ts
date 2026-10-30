// Link safety for notifications. Notification links are stored as relative
// paths ("/beskeder/…"); anything that could leave the site is rejected.

const BASE = "https://staerk50.invalid";

/**
 * Returns the link when it is a same-site relative path, otherwise null.
 * Rejects absolute URLs, protocol-relative URLs ("//…"), backslashes,
 * whitespace/control characters and anything the URL parser would resolve
 * to another origin.
 */
export function safeRelativeLink(link: string | null | undefined): string | null {
  if (typeof link !== "string") return null;
  if (link.length === 0 || link.length > 2000) return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  if (link.includes("\\")) return null;
  // Whitespace and control characters are never part of our links.
  if (/[\s\u0000-\u001f\u007f]/.test(link)) return null;

  let url: URL;
  try {
    url = new URL(link, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/beskeder/ny?til=<id>" – starts (or reopens) a private conversation. */
export function newConversationHref(otherUserId: string) {
  return `/beskeder/ny?til=${encodeURIComponent(otherUserId)}`;
}

/** Link for "Skriv til <coach>", or null when no coach account is set or the viewer is the coach. */
export function coachConversationHref(coachUserId: string | null | undefined, viewerId: string) {
  return coachUserId && coachUserId !== viewerId ? newConversationHref(coachUserId) : null;
}
