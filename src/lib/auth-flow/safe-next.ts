// Safe handling of the "?next=" parameter used across the login/signup flow.
// Only same-site relative paths are accepted, so a link can never send a
// visitor to another website after logging in (open redirect protection).

const MAX_LENGTH = 512;

/**
 * Returns `next` if it is a same-site relative path, otherwise `fallback`.
 * Accepted: "/hjem", "/beskeder/123?x=1". Rejected: "//evil.dk", "/\\evil.dk",
 * "https://evil.dk", "hjem", values with backslashes, whitespace or control characters.
 */
export function safeNext(next: unknown, fallback: string): string {
  if (typeof next !== "string") return fallback;
  if (next.length === 0 || next.length > MAX_LENGTH) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Browsers treat "\" like "/" and silently drop tabs/newlines, which can turn
  // "/\t/evil.dk" into "//evil.dk". Reject backslashes, whitespace and control characters outright.
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/** First value of a search param (Next.js gives string | string[] | undefined). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A validated `next` from the URL, or "" when missing/unsafe (for hidden form fields). */
export function nextFromParams(value: string | string[] | undefined): string {
  return safeNext(firstParam(value), "");
}

/** Appends ?next=… to an auth link when a validated `next` is present. */
export function withNext(path: string, next: string): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
