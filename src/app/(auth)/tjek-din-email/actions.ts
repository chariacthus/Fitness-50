"use server";

import { createClient } from "@/lib/supabase/server";
import { zodFieldErrors } from "@/lib/action-result";
import { authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";
import type { AuthFormState } from "@/lib/auth-flow/form-state";
import { safeNext } from "@/lib/auth-flow/safe-next";
import { emailOnlySchema, formText } from "@/lib/auth-flow/schemas";
import { clientIp, confirmRedirectUrl, withinRateLimits } from "@/lib/auth-flow/server";

const ONE_HOUR = 60 * 60;

/** Sends the signup confirmation email again. Used on /tjek-din-email and /log-ind. */
export async function resendConfirmation(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(formText(formData, "next"), "/bliv-medlem");
  const values = { email: formText(formData, "email").trim() };
  const parsed = emailOnlySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Tjek e-mailadressen.", fieldErrors: zodFieldErrors(parsed.error.issues), values };
  }
  const { email } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimits([
    { key: `resend:ip:${ip}`, max: 5, windowSeconds: ONE_HOUR },
    { key: `resend:email:${email}`, max: 3, windowSeconds: ONE_HOUR },
  ]);
  if (!allowed) {
    return { ok: false, error: "Du har bedt om mange e-mails på kort tid. Vent lidt, og prøv så igen.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: confirmRedirectUrl(next) },
  });

  if (error) {
    const kind = authErrorKind(error);
    // Only problems that say nothing about whether the account exists are shown as errors.
    if (kind === "rate_limit" || kind === "network" || kind === "email_not_authorized" || (error.status ?? 0) >= 500) {
      console.error("[auth] resend failed", error.code, error.status);
      return { ok: false, error: translateAuthError(error), values };
    }
  }

  return {
    ok: true,
    message:
      "Hvis der venter en konto på at blive bekræftet med den e-mail, har vi sendt et nyt link. Tjek også mappen med uønsket post (spam). Er din konto allerede bekræftet, kan du bare logge ind.",
    values: { email },
  };
}
