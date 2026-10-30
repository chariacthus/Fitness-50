import "server-only";
import { isEmailConfigured, serverEnv } from "@/lib/server-env";

export type EmailMessage = {
  to: string;
  /** Keep subjects free of sensitive information (no health data, no message text). */
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = { sent: true; id: string } | { sent: false; reason: "not_configured" | "failed"; detail?: string };

/**
 * Sends an email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * When RESEND_API_KEY / EMAIL_FROM are missing nothing is sent and the result says so –
 * callers must never report an email as sent unless `sent` is true.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { sent: false, reason: "not_configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: serverEnv.emailFrom,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    if (!response.ok) {
      return { sent: false, reason: "failed", detail: `${response.status} ${await response.text().catch(() => "")}`.slice(0, 300) };
    }
    const body = (await response.json()) as { id?: string };
    return { sent: true, id: body.id ?? "" };
  } catch (error) {
    return { sent: false, reason: "failed", detail: error instanceof Error ? error.message : "unknown" };
  }
}
