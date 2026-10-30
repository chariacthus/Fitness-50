"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { newAnnouncementSchema } from "@/lib/announcements/schema";
import { CHECK_FIELDS, failForm, NOT_ADMIN, readValues, type FormState } from "@/lib/profile/form-state";

/** Creates a draft announcement and opens it in the editor. */
export async function createAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN);

  const values = readValues(formData, ["title", "body"]);
  const parsed = newAnnouncementSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ title: parsed.data.title, body: parsed.data.body, author_id: admin.userId, status: "draft" })
    .select("id")
    .single();
  if (error || !data) return failForm(dbErrorMessage(error, "Kladden kunne ikke gemmes. Prøv igen."), undefined, values);

  revalidatePath("/admin/opslag");
  redirect(`/admin/opslag/${data.id}?oprettet=1`);
}
