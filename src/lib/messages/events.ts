// Browser event fired after something was marked as read, so the unread
// badges in the navigation can refresh immediately. Harmless when nothing
// listens for it.

export const UNREAD_COUNTS_REFRESH_EVENT = "staerk50:unread-counts-refresh";

export function requestUnreadCountsRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(UNREAD_COUNTS_REFRESH_EVENT));
}

/** True when the element is visible or just below the visible part of the page. */
export function isNearViewport(element: Element | null, threshold = 200) {
  if (!element || typeof window === "undefined") return false;
  return element.getBoundingClientRect().top <= window.innerHeight + threshold;
}

/** Smooth scrolling unless the user prefers reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
