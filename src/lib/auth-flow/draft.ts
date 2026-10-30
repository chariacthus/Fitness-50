"use client";

import { useEffect, type RefObject } from "react";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Draft = { at: number; values: Record<string, string | boolean> };

/**
 * Keeps what the visitor typed in the browser's local storage, so the form is
 * filled in again after visiting e.g. the privacy policy and coming back.
 * Only the listed (non-secret) fields are stored – never passwords. The draft
 * is removed when the form is submitted and expires after 24 hours.
 */
export function useFormDraft(formRef: RefObject<HTMLFormElement | null>, key: string, fields: readonly string[]) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const storageKey = `staerk50:udkast:${key}`;

    const field = (name: string) => {
      const el = form.elements.namedItem(name);
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
    };

    try {
      const raw = window.localStorage.getItem(storageKey);
      const saved = raw ? (JSON.parse(raw) as Draft) : null;
      if (saved && Date.now() - saved.at < MAX_AGE_MS) {
        for (const name of fields) {
          const el = field(name);
          const value = saved.values[name];
          if (!el || value === undefined) continue;
          if (el instanceof HTMLInputElement && el.type === "checkbox") {
            if (typeof value === "boolean" && !el.checked) el.checked = value;
          } else if (typeof value === "string" && !el.value) {
            el.value = value;
          }
        }
      } else if (saved) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage unavailable (private mode, blocked): the form still works.
    }

    const save = () => {
      try {
        const values: Draft["values"] = {};
        for (const name of fields) {
          const el = field(name);
          if (!el) continue;
          values[name] = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value;
        }
        window.localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), values } satisfies Draft));
      } catch {
        // Ignore – saving a draft is only a convenience.
      }
    };
    const clear = () => {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore.
      }
    };

    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", clear);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", clear);
    };
  }, [formRef, key, fields]);
}
