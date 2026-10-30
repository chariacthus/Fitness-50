// Standard result for server actions, so every form can show a real outcome.

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialActionState: ActionResult = { ok: false, error: "" };

export function ok<T = undefined>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Converts zod issues into { field: message } using the first issue per field. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Turns a Supabase/Postgres error into a Danish message safe to show to users. */
export function dbErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Noget gik galt. Prøv igen.") {
  if (!error) return fallback;
  // Our own database functions raise Danish messages with these codes.
  if (error.code === "P0001" || error.code === "22023") return error.message ?? fallback;
  if (error.code === "42501") return error.message && /[æøå]|ikke|kun|tilladt/i.test(error.message) ? error.message : "Du har ikke adgang til at gøre dette.";
  if (error.code === "23505") return "Dette findes allerede.";
  if (error.code === "23514") return "Nogle af oplysningerne er ugyldige. Tjek felterne og prøv igen.";
  return fallback;
}
