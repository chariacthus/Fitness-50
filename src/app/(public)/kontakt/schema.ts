import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";

/** Hidden field that people never see; bots tend to fill it in. */
export const HONEYPOT_FIELD = "kontrolfelt";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Skriv dit navn.").max(120, "Navnet må højst være 120 tegn."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Skriv din e-mail.")
    .max(200, "E-mailen må højst være 200 tegn.")
    .pipe(z.email("Skriv en gyldig e-mail, f.eks. navn@eksempel.dk.")),
  phone: z
    .string()
    .trim()
    .max(40, "Telefonnummeret må højst være 40 tegn.")
    .regex(/^[0-9+()\s-]*$/, "Telefonnummeret må kun indeholde tal, mellemrum og +.")
    .transform((value) => value || null),
  message: z
    .string()
    .trim()
    .min(1, "Skriv en besked.")
    .max(5000, "Beskeden må højst være 5000 tegn."),
});

export type ContactValues = { name: string; email: string; phone: string; message: string };

/** Action result plus the submitted values, so the form keeps them after an error. */
export type ContactState = ActionResult & { values?: ContactValues };

export const initialContactState: ContactState = { ok: false, error: "" };
