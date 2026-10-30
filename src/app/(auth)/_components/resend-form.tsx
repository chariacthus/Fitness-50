"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldError, initialAuthState } from "@/lib/auth-flow/form-state";
import { resendConfirmation } from "../tjek-din-email/actions";

/** Form that sends the signup confirmation email again. */
export function ResendConfirmationForm({ next, defaultEmail, idPrefix = "resend" }: { next: string; defaultEmail?: string; idPrefix?: string }) {
  const [state, formAction] = useActionState(resendConfirmation, initialAuthState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField
        id={`${idPrefix}-email`}
        name="email"
        type="email"
        label="Din e-mail"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email ?? defaultEmail}
        error={fieldError(state, "email")}
      />
      <div aria-live="polite">
        <FormMessage state={state} successTitle="Tjek din indbakke" />
      </div>
      <SubmitButton variant="secondary" pendingText="Sender…">
        Send bekræftelsesmail igen
      </SubmitButton>
    </form>
  );
}
