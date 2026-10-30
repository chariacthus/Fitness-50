// Pure helpers shared by the admin server actions and forms.

import type { ActionResult } from "@/lib/action-result";

/**
 * ActionResult plus the submitted text values on failure. React resets a form
 * after its action has run, so the form puts these values back as defaults –
 * otherwise the administrator would lose what he typed when a field is invalid.
 */
export type FormState = ActionResult & { values?: Record<string, string> };

export const initialFormState: FormState = { ok: false, error: "" };

export const NOT_ADMIN_MESSAGE = "Kun administratorer kan gøre dette. Log ind igen, hvis du er administrator.";
export const CHECK_FIELDS_MESSAGE = "Tjek de markerede felter, og prøv igen.";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** A form field as a string ("" when missing or a file). */
export function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Submitted text values for the given fields (used to refill the form after an error). */
export function readValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readText(formData, key)]));
}

export function failForm(error: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): FormState {
  return { ok: false, error, fieldErrors, values };
}

/** Trimmed text or null when empty (optional database columns). */
export function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** First value of a search parameter. */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
