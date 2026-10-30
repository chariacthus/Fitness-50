"use client";

import type { ActionResult } from "@/lib/action-result";
import { Alert } from "@/components/ui/alert";

/** Shows the outcome of a server action (only after it has actually run). */
export function FormMessage({ state, successTitle }: { state: ActionResult<unknown> | null | undefined; successTitle?: string }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <Alert tone="success" title={successTitle ?? "Udført"}>
        {state.message}
      </Alert>
    ) : null;
  }
  if (!state.error) return null;
  return <Alert tone="danger">{state.error}</Alert>;
}
