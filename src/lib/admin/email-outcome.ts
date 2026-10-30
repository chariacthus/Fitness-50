// Turns the real result of emailMember() into a Danish sentence for the admin.

export type EmailOutcome =
  | { sent: true; id?: string }
  | { sent: false; reason: "not_configured" | "failed" | "disabled" | "opted_out" | "no_address" | "error"; detail?: string };

const CODES = ["sent", "not_configured", "failed", "disabled", "opted_out", "no_address", "error"] as const;

/** Short code for the URL after a redirect (e.g. ?udgivet=sent). */
export function emailOutcomeCode(outcome: EmailOutcome): (typeof CODES)[number] {
  return outcome.sent ? "sent" : outcome.reason;
}

export function parseEmailOutcomeCode(code: string): EmailOutcome | null {
  if (!(CODES as readonly string[]).includes(code)) return null;
  return code === "sent" ? { sent: true } : { sent: false, reason: code as Exclude<(typeof CODES)[number], "sent"> };
}

export function emailOutcomeText(outcome: EmailOutcome, name: string): string {
  if (outcome.sent) return `Der er sendt en e-mail til ${name}.`;
  switch (outcome.reason) {
    case "disabled":
      return "Der er ikke sendt en e-mail, fordi e-mails til medlemmer er slået fra under Indstillinger.";
    case "not_configured":
      return "Der er ikke sendt en e-mail, fordi e-mailafsendelse ikke er sat op endnu.";
    case "opted_out":
      return `Der er ikke sendt en e-mail, fordi ${name} har fravalgt e-mails.`;
    case "no_address":
      return `Der er ikke sendt en e-mail, fordi der ikke er registreret en e-mailadresse for ${name}.`;
    default:
      return "E-mailen kunne ikke sendes.";
  }
}
