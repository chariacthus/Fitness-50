"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { zodFieldErrors } from "@/lib/action-result";
import { authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";
import type { AuthFormState } from "@/lib/auth-flow/form-state";
import { safeNext, withNext } from "@/lib/auth-flow/safe-next";
import { formText, signupSchema } from "@/lib/auth-flow/schemas";
import { clientIp, confirmRedirectUrl, withinRateLimits } from "@/lib/auth-flow/server";

const DEFAULT_NEXT = "/bliv-medlem";

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const rawNext = safeNext(formText(formData, "next"), "");
  const next = rawNext || DEFAULT_NEXT;
  const values = {
    full_name: formText(formData, "full_name").trim(),
    email: formText(formData, "email").trim(),
    accept_terms: formData.get("accept_terms") === "on",
  };
  const parsed = signupSchema.safeParse({
    ...values,
    password: formText(formData, "password"),
    password_repeat: formText(formData, "password_repeat"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Tjek de markerede felter.", fieldErrors: zodFieldErrors(parsed.error.issues), values };
  }
  const { full_name, email, password } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimits([{ key: `signup:ip:${ip}`, max: 10, windowSeconds: 60 * 60 }]);
  if (!allowed) {
    return { ok: false, error: "Der er oprettet mange konti fra din forbindelse på kort tid. Vent lidt, og prøv så igen.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name }, emailRedirectTo: confirmRedirectUrl(next) },
  });

  if (error) {
    const kind = authErrorKind(error);
    if (kind === "user_exists") {
      // Same outcome as a new signup, so the form never reveals who has an account.
      redirect(withNext("/tjek-din-email", rawNext));
    }
    if (kind === "weak_password" || kind === "pwned_password") {
      return { ok: false, error: "Vælg en anden adgangskode.", fieldErrors: { password: translateAuthError(error) }, values };
    }
    if (kind === "invalid_email") {
      return { ok: false, error: "Tjek de markerede felter.", fieldErrors: { email: translateAuthError(error) }, values };
    }
    if (kind === "unknown") console.error("[auth] signUp failed", error.code, error.status);
    return { ok: false, error: translateAuthError(error), values };
  }

  if (data.session) {
    // Email confirmation is switched off in Supabase: the visitor is logged in right away.
    revalidatePath("/", "layout");
    redirect(next);
  }
  redirect(withNext("/tjek-din-email", rawNext));
}
