"use client";

import { useActionState, useState } from "react";
import { CheckboxField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Panel } from "@/components/ui/layout";
import { fieldError, initialAuthState } from "@/lib/auth-flow/form-state";
import { PASSWORD_MIN } from "@/lib/auth-flow/schemas";
import { updatePassword } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);
  const passwordType = showPassword ? "text" : "password";

  return (
    <Panel as="div">
      <form action={formAction} className="space-y-5" noValidate>
        <div aria-live="polite">
          <FormMessage state={state} />
        </div>
        <TextField
          name="password"
          type={passwordType}
          label="Ny adgangskode"
          hint={`Mindst ${PASSWORD_MIN} tegn. Et par ord sat sammen er nemt at huske og svært at gætte.`}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          error={fieldError(state, "password")}
        />
        <TextField
          name="password_repeat"
          type={passwordType}
          label="Gentag ny adgangskode"
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
        <SubmitButton size="lg" className="w-full" pendingText="Gemmer…">
          Gem ny adgangskode
        </SubmitButton>
      </form>
    </Panel>
  );
}
