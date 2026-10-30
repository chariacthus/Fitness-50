"use client";

import { useEffect } from "react";

/**
 * Adds a ripple that spreads from the exact point where a button is pressed.
 * One document-level listener serves every element with `data-ripple`.
 * Purely decorative; skipped when the user prefers reduced motion.
 */
export function RippleEffect() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onPointerDown(event: PointerEvent) {
      if (reduce.matches || event.button !== 0) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-ripple]");
      if (!target || target.hasAttribute("disabled")) return;
      const rect = target.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return null;
}
