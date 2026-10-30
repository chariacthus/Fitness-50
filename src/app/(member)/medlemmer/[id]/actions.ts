"use server";

import type { ActionResult } from "@/lib/action-result";
import { submitReport } from "@/lib/messages/report-server";

/** "Anmeld profil". report_content() only accepts profiles the reporter can see. */
export async function reportProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return submitReport(formData, "profile");
}
