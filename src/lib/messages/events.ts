// Browser event fired after something was marked as read, so the unread
// badges in the navigation can refresh immediately. Harmless when nothing
// listens for it.

export const UNREAD_COUNTS_REFRESH_EVENT = "staerk50:unread-counts-refresh";

export function requestUnreadCountsRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UNREAD_COUNTS_REFRESH_EVENT));
}

/** True when the page is scrolled (almost) to the bottom. */
export function isNearPageBottom(threshold = 240) {
  if (typeof window === "undefined") return false;
  const scrolled = window.scrollY + window.innerHeight;
  return document.documentElement.scrollHeight - scrolled <= threshold;
}

/** Smooth scrolling unless the user prefers reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
