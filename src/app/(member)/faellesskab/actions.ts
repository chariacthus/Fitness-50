"use server";

import type { ActionResult } from "@/lib/action-result";
import { submitReport } from "@/lib/messages/report-server";

/** "Anmeld" on a community message. Permission checks happen in report_content(). */
export async function reportCommunityMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return submitReport(formData, "community_message");
}
