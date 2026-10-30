"use server";

import { createClient } from "@/lib/supabase/server";
import { zodFieldErrors } from "@/lib/action-result";
import { authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";
import type { AuthFormState } from "@/lib/auth-flow/form-state";
import { emailOnlySchema, formText } from "@/lib/auth-flow/schemas";
import { clientIp, confirmRedirectUrl, withinRateLimits } from "@/lib/auth-flow/server";

const ONE_HOUR = 60 * 60;

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: formText(formData, "email").trim() };
  const parsed = emailOnlySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Tjek e-mailadressen.", fieldErrors: zodFieldErrors(parsed.error.issues), values };
  }
  const { email } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimits([
    { key: `reset:ip:${ip}`, max: 5, windowSeconds: ONE_HOUR },
    { key: `reset:email:${email}`, max: 3, windowSeconds: ONE_HOUR },
  ]);
  if (!allowed) {
    return { ok: false, error: "Du har bedt om mange links på kort tid. Vent lidt, og prøv så igen.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: confirmRedirectUrl("/nulstil-adgangskode"),
  });

  if (error) {
    const kind = authErrorKind(error);
    // Only problems that say nothing about whether the account exists are shown as errors.
    if (kind === "rate_limit" || kind === "network" || kind === "email_not_authorized" || (error.status ?? 0) >= 500) {
      console.error("[auth] resetPasswordForEmail failed", error.code, error.status);
      return { ok: false, error: translateAuthError(error), values };
    }
  }

  return {
    ok: true,
    message:
      "Hvis der findes en konto med den e-mail, har vi sendt et link, så du kan vælge en ny adgangskode. Tjek også mappen med uønsket post (spam). Linket virker kun i begrænset tid.",
    values: { email },
  };
}
