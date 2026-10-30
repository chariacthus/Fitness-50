"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { notifyUser } from "@/lib/notifications";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, readText, readValues, type FormState } from "@/lib/admin/forms";
import { memberDisplayName } from "@/lib/admin/members";
import { grantAddonSchema } from "@/lib/admin/schemas";
import { applyCommunitySuspension } from "@/lib/admin/suspension";

/** Explicit, logged grant of the nutrition add-on (rpc grant_addon records who granted it). */
export async function grantNutritionAccess(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const parsed = grantAddonSchema.safeParse({ user_id: readText(formData, "user_id"), note: readText(formData, "note") });
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), readValues(formData, ["note"]));
  const { user_id, note } = parsed.data;

  const supabase = await createClient();
  const { data: profile, error: loadError } = await supabase.from("profiles").select("id, full_name").eq("id", user_id).maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  if (!profile) return failForm("Medlemmet blev ikke fundet.");
  const name = memberDisplayName(profile.full_name, "Medlemmet");

  const { error } = await supabase.rpc("grant_addon", {
    p_user: user_id,
    p_slug: "kostplan",
    p_note: note || `Givet af ${memberDisplayName(admin.profile.full_name, "administrator")}`,
  });
  if (error) return failForm(dbErrorMessage(error), undefined, readValues(formData, ["note"]));

  // Best effort: tell the member, so he can answer the nutrition questions.
  let notified = false;
  try {
    const settings = await getSiteSettings();
    notified = await notifyUser({
      userId: user_id,
      type: "nutrition_plan",
      title: "Du har fået adgang til en personlig kostplan",
      body: `${settings.coach_name} laver din kostplan ud fra dine svar om kost. Du får besked, når den er klar.`,
      link: "/min-traening/kostplan",
    });
  } catch (e) {
    console.error("[admin/medlemmer] notifikation om kostplan:", e instanceof Error ? e.message : e);
  }

  revalidatePath(`/admin/medlemmer/${user_id}`);
  revalidatePath("/admin/medlemmer");
  revalidatePath("/admin/kostplaner");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${name} har nu adgang til en personlig kostplan. ${
      notified ? `${name} har fået en notifikation på siden.` : "Der kunne ikke sendes en notifikation på siden – giv gerne selv besked."
    }`,
  };
}

export async function setMemberSuspension(_prev: FormState, formData: FormData): Promise<FormState> {
  return applyCommunitySuspension(formData);
}
