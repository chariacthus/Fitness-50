import "server-only";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, readText, readValues, type FormState } from "@/lib/admin/forms";
import { genitive, memberDisplayName } from "@/lib/admin/members";
import { suspensionSchema } from "@/lib/admin/schemas";

/**
 * Pauses or restores a member's access to the community (rpc
 * set_community_suspension, which also logs the action and notifies the
 * member). Shared by the member page and the reports page.
 */
export async function applyCommunitySuspension(formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const parsed = suspensionSchema.safeParse({
    user_id: readText(formData, "user_id"),
    suspend: readText(formData, "suspend") === "true",
    reason: readText(formData, "reason"),
  });
  if (!parsed.success) {
    return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), readValues(formData, ["reason"]));
  }
  const { user_id, suspend, reason } = parsed.data;

  const supabase = await createClient();
  const { data: profile, error: loadError } = await supabase
    .from("profiles")
    .select("id, full_name, community_suspended")
    .eq("id", user_id)
    .maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  if (!profile) return failForm("Medlemmet blev ikke fundet.");
  const name = memberDisplayName(profile.full_name, "Medlemmet");
  if (profile.community_suspended === suspend) {
    return failForm(suspend ? `${genitive(name)} adgang til fællesskabet er allerede sat på pause.` : `${name} har allerede adgang til fællesskabet.`);
  }

  const { error } = await supabase.rpc("set_community_suspension", {
    p_user: user_id,
    p_suspended: suspend,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) return failForm(dbErrorMessage(error), undefined, readValues(formData, ["reason"]));

  revalidatePath(`/admin/medlemmer/${user_id}`);
  revalidatePath("/admin/medlemmer");
  revalidatePath("/admin/rapporter");
  return {
    ok: true,
    message: suspend
      ? `${genitive(name)} adgang til fællesskabet er sat på pause. ${name} har fået besked på siden.`
      : `${name} har fået adgang til fællesskabet igen og har fået besked på siden.`,
  };
}
