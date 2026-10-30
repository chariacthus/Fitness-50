"use server";

// Server actions for /admin (Overblik). They live here because only
// src/app/admin/page.tsx – not the whole src/app/admin folder – belongs to
// the admin area.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOT_ADMIN_MESSAGE, failForm, isUuid, readText, type FormState } from "@/lib/admin/forms";

/** Marks one (id) or all (all=true) of the administrator's own notifications as read. */
export async function markAdminNotificationsRead(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const all = readText(formData, "all") === "true";
  const id = readText(formData, "id");
  if (!all && !isUuid(id)) return failForm("Notifikationen blev ikke fundet. Genindlæs siden og prøv igen.");

  const supabase = await createClient();
  // The function only ever touches the caller's own notifications.
  const { data, error } = await supabase.rpc("mark_notifications_read", all ? {} : { p_ids: [id] });
  if (error) return failForm(dbErrorMessage(error));

  revalidatePath("/admin");
  revalidatePath("/notifikationer");
  if (typeof data === "number" && data === 0) {
    return failForm(all ? "Der var ingen ulæste notifikationer." : "Notifikationen var allerede markeret som læst.");
  }
  // The notification disappears from the list, so the page confirms the
  // result after checking it in the database.
  redirect(all ? "/admin?laest=alle" : `/admin?laest=${id}`);
}
