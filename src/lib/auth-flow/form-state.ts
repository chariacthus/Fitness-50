import type { ActionResult } from "@/lib/action-result";

// State shared by the auth forms. Besides the normal ActionResult it can carry
// the non-secret values the visitor typed (never passwords), so a form that
// failed validation keeps its content, and a flag for "e-mail not confirmed".

export type AuthFormValues = {
  email?: string;
  full_name?: string;
  accept_terms?: boolean;
};

export type AuthFormState = ActionResult & {
  values?: AuthFormValues;
  needsConfirmation?: boolean;
};

export const initialAuthState: AuthFormState = { ok: false, error: "" };

/** Field error for `name`, if the last submit failed on that field. */
export function fieldError(state: AuthFormState, name: string): string | undefined {
  return state.ok ? undefined : state.fieldErrors?.[name];
}
