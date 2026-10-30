"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { zodFieldErrors } from "@/lib/action-result";
import { AUTH_ERROR_MESSAGES, authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";
import type { AuthFormState } from "@/lib/auth-flow/form-state";
import { formText, resetPasswordSchema } from "@/lib/auth-flow/schemas";
import { clearAuthCookies } from "@/lib/auth-flow/server";

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formText(formData, "password"),
    password_repeat: formText(formData, "password_repeat"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Tjek de markerede felter.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }

  // The session comes from the recovery/invite link (verified in /auth/confirm).
  if (!(await getUserId())) {
    return { ok: false, error: `${AUTH_ERROR_MESSAGES.invalid_link} Bed om et nyt link under »Glemt adgangskode?«.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const kind = authErrorKind(error);
    if (kind === "weak_password" || kind === "pwned_password" || kind === "same_password") {
      return { ok: false, error: "Vælg en anden adgangskode.", fieldErrors: { password: translateAuthError(error) } };
    }
    if (kind === "unknown") console.error("[auth] updateUser(password) failed", error.code, error.status);
    return { ok: false, error: translateAuthError(error) };
  }

  // The new password is saved. Sign out everywhere, so any old session (also on
  // a lost phone) stops working, and let the member log in with the new password.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    console.error("[auth] global sign-out after password reset failed", signOutError.code, signOutError.status);
    await clearAuthCookies();
  }

  revalidatePath("/", "layout");
  redirect("/log-ind?besked=adgangskode-opdateret");
}
