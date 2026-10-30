"use client";

import { useActionState } from "react";
import { TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/layout";
import { fieldError, initialAuthState } from "@/lib/auth-flow/form-state";
import { withNext } from "@/lib/auth-flow/safe-next";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(requestPasswordReset, initialAuthState);

  return (
    <Panel as="div">
      <div aria-live="polite">
        {state.ok ? (
          <div className="space-y-6">
            <FormMessage state={state} successTitle="Tjek din indbakke" />
            <ButtonLink href={withNext("/log-ind", next)} variant="secondary">
              Tilbage til log ind
            </ButtonLink>
          </div>
        ) : null}
      </div>
      {!state.ok ? (
        <form action={formAction} className="space-y-5" noValidate>
          <FormMessage state={state} />
          <TextField
            name="email"
            type="email"
            label="E-mail"
            hint="Skriv den e-mail, du bruger, når du logger ind."
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={fieldError(state, "email")}
          />
          <SubmitButton size="lg" className="w-full" pendingText="Sender…">
            Send link
          </SubmitButton>
        </form>
      ) : null}
    </Panel>
  );
}
