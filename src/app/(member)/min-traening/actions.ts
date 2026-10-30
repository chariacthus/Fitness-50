"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, fail, ok, type ActionResult } from "@/lib/action-result";
import { getViewer } from "@/lib/auth";
import { todayInCopenhagen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const completionSchema = z.object({
  session_id: z.guid("Træningen blev ikke fundet."),
  mode: z.enum(["complete", "undo"]),
});

/**
 * Marks a session as completed today, or undoes today's mark.
 * Row Level Security checks that the session belongs to the member's own
 * published plan – the session id from the form is never trusted on its own.
 */
export async function setSessionCompletion(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = completionSchema.safeParse({ session_id: formData.get("session_id"), mode: formData.get("mode") });
  if (!parsed.success) return fail("Træningen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const viewer = await getViewer();
  if (!viewer) return fail("Du er ikke logget ind længere. Log ind igen, og prøv igen.");
  if (!viewer.isEntitled) return fail("Du skal have et aktivt medlemskab for at registrere træninger.");

  const supabase = await createClient();
  const today = todayInCopenhagen();
  const { session_id, mode } = parsed.data;

  if (mode === "complete") {
    const { error } = await supabase
      .from("workout_completions")
      .insert({ member_id: viewer.userId, session_id, completed_on: today });
    if (error && error.code !== "23505") {
      return fail(dbErrorMessage(error, "Træningen kunne ikke markeres som gennemført. Prøv igen."));
    }
    revalidatePath("/min-traening");
    revalidatePath("/hjem");
    return ok(error ? "Træningen var allerede markeret som gennemført i dag." : "Godt gået! Træningen er markeret som gennemført i dag.");
  }

  const { data, error } = await supabase
    .from("workout_completions")
    .delete()
    .eq("member_id", viewer.userId)
    .eq("session_id", session_id)
    .eq("completed_on", today)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "Markeringen kunne ikke fortrydes. Prøv igen."));
  revalidatePath("/min-traening");
  revalidatePath("/hjem");
  return ok(data && data.length > 0 ? "Markeringen er fortrudt." : "Træningen var ikke markeret som gennemført i dag.");
}
