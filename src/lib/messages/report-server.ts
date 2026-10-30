import "server-only";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/auth";
import { reportSchema, type ReportTarget } from "@/lib/messages/report";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared body of the "Anmeld" server actions. Runs report_content() as the
 * logged-in user: the database checks that the reporter may see the content
 * (community access / conversation participant / visible profile), stores a
 * snapshot for the moderator and notifies the administrators.
 */
export async function submitReport(formData: FormData, expected: ReportTarget): Promise<ActionResult> {
  const parsed = reportSchema.safeParse({
    target_type: formData.get("target_type"),
    target_id: formData.get("target_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error.issues);
    return fail(fieldErrors.reason ? "Tjek begrundelsen, og prøv igen." : "Indholdet blev ikke fundet. Genindlæs siden, og prøv igen.", fieldErrors);
  }
  if (parsed.data.target_type !== expected) {
    return fail("Indholdet kunne ikke anmeldes. Genindlæs siden, og prøv igen.");
  }

  const userId = await getUserId();
  if (!userId) return fail("Du er ikke logget ind længere. Log ind igen, og prøv på ny.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_target_type: parsed.data.target_type,
    p_target_id: parsed.data.target_id,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(dbErrorMessage(error, "Anmeldelsen kunne ikke sendes. Prøv igen."));

  revalidatePath("/admin/rapporter");
  return ok("Tak. Din anmeldelse er sendt og bliver gennemgået.");
}
