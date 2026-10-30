"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOT_ADMIN_MESSAGE, failForm, isUuid, readText, type FormState } from "@/lib/admin/forms";

export async function markContactHandled(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const id = readText(formData, "id");
  if (!isUuid(id)) return failForm("Beskeden blev ikke fundet. Genindlæs siden og prøv igen.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ handled_at: new Date().toISOString(), handled_by: admin.userId })
    .eq("id", id)
    .is("handled_at", null)
    .select("id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Beskeden er allerede markeret som håndteret.");

  revalidatePath("/admin/kontakt");
  revalidatePath("/admin");
  // The message leaves the "Ikke håndteret" list, so the page confirms it after the redirect.
  const view = readText(formData, "vis");
  redirect(`/admin/kontakt?${view === "alle" || view === "haandterede" ? `vis=${view}&` : ""}haandteret=${id}`);
}
