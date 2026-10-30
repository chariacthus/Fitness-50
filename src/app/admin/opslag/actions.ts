"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failForm, NOT_ADMIN, readText, type FormState } from "@/lib/profile/form-state";

const pinSchema = z.object({
  id: z.guid("Opslaget blev ikke fundet."),
  pinned: z.enum(["true", "false"]),
});

/** "Fastgør" / "Frigør" – keeps an announcement at the top of the wall. */
export async function setAnnouncementPinned(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);
  const parsed = pinSchema.safeParse({ id: readText(formData, "id"), pinned: readText(formData, "pinned") });
  if (!parsed.success) return failForm("Opslaget blev ikke fundet. Genindlæs siden, og prøv igen.");

  const pinned = parsed.data.pinned === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ is_pinned: pinned })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error) return failForm(dbErrorMessage(error, "Opslaget kunne ikke ændres. Prøv igen."));
  if (!data) return failForm("Opslaget blev ikke fundet. Måske er det slettet.");

  revalidatePath("/admin/opslag");
  revalidatePath(`/admin/opslag/${parsed.data.id}`);
  revalidatePath("/opslag");
  revalidatePath("/hjem");
  return { ok: true, message: pinned ? "Opslaget er fastgjort øverst." : "Opslaget er ikke længere fastgjort." };
}
