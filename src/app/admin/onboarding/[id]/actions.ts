"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOT_ADMIN_MESSAGE, failForm, isUuid, readText, type FormState } from "@/lib/admin/forms";

export async function markSubmissionReviewed(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const id = readText(formData, "id");
  if (!isUuid(id)) return failForm("Skemaet blev ikke fundet. Genindlæs siden og prøv igen.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_submissions")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: admin.userId })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id, user_id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Skemaet er allerede gennemgået, eller medlemmet har ikke sendt det endnu.");

  revalidatePath(`/admin/onboarding/${id}`);
  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/medlemmer/${data[0].user_id}`);
  revalidatePath("/admin");
  return { ok: true, message: "Skemaet er markeret som gennemgået." };
}
