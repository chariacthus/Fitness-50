"use client";

import { useActionState } from "react";
import { fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeEmail, changePassword } from "./actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, initialFormState);
  return (
    <form action={action} className="space-y-5" aria-labelledby="adgangskode-titel">
      <TextField
        id="new-password"
        name="password"
        label="Ny adgangskode"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint="Mindst 8 tegn – gerne en blanding af bogstaver og tal."
        error={fieldError(state, "password")}
      />
      <TextField
        id="new-password-repeat"
        name="password_repeat"
        label="Gentag den nye adgangskode"
        type="password"
        autoComplete="new-password"
        required
        maxLength={72}
        error={fieldError(state, "password_repeat")}
      />
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
      <SubmitButton pendingText="Gemmer…">Skift adgangskode</SubmitButton>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [state, action] = useActionState(changeEmail, initialFormState);
  return (
    <form action={action} className="space-y-5" aria-labelledby="email-titel">
      <p>
        Din e-mailadresse er nu: <span className="font-semibold">{currentEmail ?? "ikke oplyst"}</span>
      </p>
      <TextField
        id="new-email"
        name="email"
        label="Ny e-mailadresse"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        hint="Vi sender et link til den nye adresse. Adressen skifter først, når du har klikket på linket."
        defaultValue={fieldValue(state, "email", "")}
        error={fieldError(state, "email")}
      />
      <div aria-live="polite">
        <FormMessage state={state} successTitle="Tjek din e-mail" />
      </div>
      <SubmitButton pendingText="Sender…">Skift e-mailadresse</SubmitButton>
    </form>
  );
}
