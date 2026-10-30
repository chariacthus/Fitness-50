// Form state shared by the announcement and profile forms.

import type { ActionResult } from "@/lib/action-result";

/**
 * ActionResult plus the submitted text values after a failed attempt. React
 * resets a form once its action has run, so the form puts these values back –
 * otherwise the user would lose what he typed when a field is invalid.
 */
export type FormState = ActionResult & { values?: Record<string, string> };

export const initialFormState: FormState = { ok: false, error: "" };

export const CHECK_FIELDS = "Tjek de markerede felter, og prøv igen.";
export const NOT_LOGGED_IN = "Du er ikke logget ind længere. Log ind igen, og prøv på ny.";
export const NOT_ADMIN = "Kun administratorer kan gøre dette. Log ind igen, hvis du er administrator.";

/** A form field as a string ("" when missing or a file). */
export function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Submitted values for the given fields (used to refill the form after an error). */
export function readValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readText(formData, key)]));
}

export function failForm(error: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): FormState {
  return { ok: false, error, fieldErrors, values };
}

/** Value to show in a field: the submitted value after a failed attempt, else the saved value. */
export function fieldValue(state: FormState, name: string, saved: string | null | undefined): string {
  if (!state.ok && state.values && name in state.values) return state.values[name];
  return saved ?? "";
}

/** Checkbox state: the submitted state after a failed attempt, else the saved value. */
export function fieldChecked(state: FormState, name: string, saved: boolean): boolean {
  if (!state.ok && state.values && name in state.values) return state.values[name] === "on";
  return saved;
}

export function fieldError(state: FormState, name: string): string | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
