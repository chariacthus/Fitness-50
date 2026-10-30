"use server";

import type { ActionResult } from "@/lib/action-result";
import { submitReport } from "@/lib/messages/report-server";

/** "Anmeld" on a private message. report_content() checks that the reporter is a participant. */
export async function reportPrivateMessage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return submitReport(formData, "private_message");
}
