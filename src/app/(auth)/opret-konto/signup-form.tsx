"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckboxField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Panel } from "@/components/ui/layout";
import { fieldError, initialAuthState } from "@/lib/auth-flow/form-state";
import { withNext } from "@/lib/auth-flow/safe-next";
import { PASSWORD_MIN } from "@/lib/auth-flow/schemas";
import { signup } from "./actions";

const linkClass = "font-semibold text-brand underline underline-offset-4";

export function SignupForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signup, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);
  const passwordType = showPassword ? "text" : "password";

  return (
    <div className="space-y-8">
      <Panel as="div">
        <form action={formAction} className="space-y-5" noValidate>
          <input type="hidden" name="next" value={next} />
          <div aria-live="polite">
            <FormMessage state={state} />
          </div>
          <TextField
            name="full_name"
            label="Fulde navn"
            autoComplete="name"
            required
            maxLength={120}
            defaultValue={state.values?.full_name}
            error={fieldError(state, "full_name")}
          />
          <TextField
            name="email"
            type="email"
            label="E-mail"
            hint="Du logger ind med din e-mail. Vi sender et link, så du kan bekræfte den."
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            error={fieldError(state, "email")}
          />
          <TextField
            name="password"
            type={passwordType}
            label="Adgangskode"
            hint={`Mindst ${PASSWORD_MIN} tegn. Et par ord sat sammen er nemt at huske og svært at gætte.`}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            error={fieldError(state, "password")}
          />
          <TextField
            name="password_repeat"
            type={passwordType}
            label="Gentag adgangskode"
            autoComplete="new-password"
            required
            error={fieldError(state, "password_repeat")}
          />
          <CheckboxField
            name="show_password"
            label="Vis adgangskoder"
            defaultChecked={showPassword}
            onChange={(e) => setShowPassword(e.currentTarget.checked)}
          />
          <CheckboxField
            name="accept_terms"
            required
            defaultChecked={state.values?.accept_terms}
            error={fieldError(state, "accept_terms")}
            label={
              <>
                Jeg accepterer{" "}
                <Link href="/handelsbetingelser" className={linkClass}>
                  handelsbetingelserne
                </Link>{" "}
                og har læst{" "}
                <Link href="/privatlivspolitik" className={linkClass}>
                  privatlivspolitikken
                </Link>
                .
              </>
            }
          />
          <SubmitButton size="lg" className="w-full" pendingText="Opretter konto…">
            Opret konto
          </SubmitButton>
        </form>
      </Panel>

      <p className="text-lg">
        Har du allerede en konto?{" "}
        <Link href={withNext("/log-ind", next)} className={`inline-flex min-h-11 items-center ${linkClass}`}>
          Log ind
        </Link>
      </p>
    </div>
  );
}
