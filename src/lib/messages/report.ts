import { z } from "zod";

// Validation for "Anmeld" (report) forms. The database function
// report_content() does the real permission checks and rate limiting.

export const REPORT_TARGETS = ["community_message", "private_message", "profile"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASON_MAX = 1000;

export const reportSchema = z.object({
  target_type: z.enum(REPORT_TARGETS, { error: "Indholdet kunne ikke anmeldes. Genindlæs siden, og prøv igen." }),
  target_id: z.guid({ error: "Indholdet blev ikke fundet. Genindlæs siden, og prøv igen." }),
  reason: z
    .string({ error: "Skriv kort, hvorfor du anmelder." })
    .trim()
    .min(3, "Skriv kort, hvorfor du anmelder (mindst 3 tegn).")
    .max(REPORT_REASON_MAX, `Begrundelsen må højst være ${REPORT_REASON_MAX} tegn.`),
});

export type ReportInput = z.infer<typeof reportSchema>;
