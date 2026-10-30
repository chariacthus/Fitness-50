"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, readText, readValues, type FormState } from "@/lib/admin/forms";
import { moderateMessageSchema, resolveReportSchema } from "@/lib/admin/schemas";
import { applyCommunitySuspension } from "@/lib/admin/suspension";

function revalidateReports() {
  revalidatePath("/admin/rapporter");
  revalidatePath("/admin");
}

/** Hide or show a community message (rpc moderate_community_message logs the action). */
export async function moderateMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const parsed = moderateMessageSchema.safeParse({
    message_id: readText(formData, "message_id"),
    hide: readText(formData, "hide") === "true",
    reason: readText(formData, "reason"),
  });
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), readValues(formData, ["reason"]));
  const { message_id, hide, reason } = parsed.data;

  const supabase = await createClient();
  const { data: message, error: loadError } = await supabase
    .from("community_messages")
    .select("id, hidden_at, deleted_at")
    .eq("id", message_id)
    .maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  if (!message) return failForm("Beskeden findes ikke længere.");
  if (hide && message.hidden_at) return failForm("Beskeden er allerede skjult.");
  if (!hide && !message.hidden_at) return failForm("Beskeden er allerede synlig.");

  const { error } = await supabase.rpc("moderate_community_message", {
    p_message: message_id,
    p_hide: hide,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) return failForm(dbErrorMessage(error), undefined, readValues(formData, ["reason"]));

  revalidateReports();
  revalidatePath("/faellesskab");
  return {
    ok: true,
    message: hide ? "Beskeden er skjult. Medlemmerne kan ikke længere se den i fællesskabet." : "Beskeden er synlig i fællesskabet igen.",
  };
}

export async function suspendFromReport(_prev: FormState, formData: FormData): Promise<FormState> {
  return applyCommunitySuspension(formData);
}

/** Close a report as resolved or dismissed with an optional note (rpc resolve_report logs it). */
export async function closeReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const parsed = resolveReportSchema.safeParse({
    report_id: readText(formData, "report_id"),
    status: readText(formData, "status"),
    note: readText(formData, "note"),
  });
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), readValues(formData, ["note"]));
  const { report_id, status, note } = parsed.data;

  const supabase = await createClient();
  const { data: report, error: loadError } = await supabase.from("reports").select("id, status").eq("id", report_id).maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  if (!report) return failForm("Anmeldelsen blev ikke fundet.");
  if (report.status !== "open") return failForm("Anmeldelsen er allerede afsluttet.");

  const { error } = await supabase.rpc("resolve_report", {
    p_report: report_id,
    p_status: status,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return failForm(dbErrorMessage(error), undefined, readValues(formData, ["note"]));

  revalidateReports();
  return { ok: true, message: status === "resolved" ? "Anmeldelsen er markeret som løst." : "Anmeldelsen er afvist." };
}
