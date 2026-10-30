"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { zodFieldErrors } from "@/lib/action-result";
import { authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";
import type { AuthFormState } from "@/lib/auth-flow/form-state";
import { safeNext } from "@/lib/auth-flow/safe-next";
import { formText, loginSchema } from "@/lib/auth-flow/schemas";
import { clientIp, withinRateLimits } from "@/lib/auth-flow/server";

const FIFTEEN_MINUTES = 15 * 60;

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNext(formText(formData, "next"), "/hjem");
  const parsed = loginSchema.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  const values = { email: formText(formData, "email").trim() };
  if (!parsed.success) {
    return { ok: false, error: "Tjek de markerede felter.", fieldErrors: zodFieldErrors(parsed.error.issues), values };
  }
  const { email, password } = parsed.data;

  const ip = await clientIp();
  const allowed = await withinRateLimits([
    { key: `login:ip:${ip}`, max: 20, windowSeconds: FIFTEEN_MINUTES },
    { key: `login:email:${email}`, max: 10, windowSeconds: FIFTEEN_MINUTES },
  ]);
  if (!allowed) {
    return { ok: false, error: "Der har været for mange forsøg på at logge ind. Vent et kvarter, og prøv så igen.", values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const kind = authErrorKind(error);
    if (kind === "unknown") console.error("[auth] signInWithPassword failed", error.code, error.status);
    return {
      ok: false,
      error: translateAuthError(error),
      values: { email },
      needsConfirmation: kind === "email_not_confirmed",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}
