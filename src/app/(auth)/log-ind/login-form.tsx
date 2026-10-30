"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckboxField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Panel, SectionTitle } from "@/components/ui/layout";
import { fieldError, initialAuthState } from "@/lib/auth-flow/form-state";
import { withNext } from "@/lib/auth-flow/safe-next";
import { ResendConfirmationForm } from "../_components/resend-form";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(login, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-8">
      <Panel as="div">
        <form action={formAction} className="space-y-5" noValidate>
          <input type="hidden" name="next" value={next} />
          <div aria-live="polite">
            <FormMessage state={state} />
          </div>
          <TextField
            name="email"
            type="email"
            label="E-mail"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={fieldError(state, "email")}
          />
          <TextField
            name="password"
            type={showPassword ? "text" : "password"}
            label="Adgangskode"
            autoComplete="current-password"
            required
            error={fieldError(state, "password")}
          />
          <CheckboxField
            name="show_password"
            label="Vis adgangskode"
            defaultChecked={showPassword}
            onChange={(e) => setShowPassword(e.currentTarget.checked)}
          />
          <SubmitButton size="lg" className="w-full" pendingText="Logger ind…">
            Log ind
          </SubmitButton>
          <p>
            <Link
              href={withNext("/glemt-adgangskode", next)}
              className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
            >
              Glemt adgangskode?
            </Link>
          </p>
        </form>
      </Panel>

      {state.needsConfirmation ? (
        <section aria-labelledby="bekraeft-titel">
          <Panel as="div">
            <SectionTitle id="bekraeft-titel">Få et nyt bekræftelseslink</SectionTitle>
            <p className="mt-2 mb-5 text-ink-soft">
              Kan du ikke finde e-mailen? Så sender vi en ny. Husk også at kigge i mappen med uønsket post (spam).
            </p>
            <ResendConfirmationForm next={next} defaultEmail={state.values?.email} idPrefix="login-resend" />
          </Panel>
        </section>
      ) : null}

      <p className="text-lg">
        Er du ny her?{" "}
        <Link href={withNext("/opret-konto", next)} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
          Opret konto
        </Link>
      </p>
    </div>
  );
}
