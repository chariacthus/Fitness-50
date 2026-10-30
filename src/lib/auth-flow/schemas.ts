import { z } from "zod";

// Input validation for the auth forms. Messages are shown next to the fields.

export const PASSWORD_MIN = 8;
// Supabase (bcrypt) ignores everything after 72 bytes, so we stop there.
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Skriv din e-mailadresse.")
  .max(254, "E-mailadressen er for lang.")
  .pipe(z.email("Skriv en gyldig e-mailadresse, fx navn@eksempel.dk."));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Adgangskoden skal være mindst ${PASSWORD_MIN} tegn.`)
  .max(PASSWORD_MAX, `Adgangskoden må højst være ${PASSWORD_MAX} tegn.`);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Skriv din adgangskode.").max(200, "Adgangskoden er for lang."),
});

export const signupSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Skriv dit fulde navn.")
      .max(120, "Navnet må højst være 120 tegn."),
    email: emailSchema,
    password: newPasswordSchema,
    password_repeat: z.string(),
    accept_terms: z.literal(true, { error: "Du skal acceptere handelsbetingelserne og privatlivspolitikken for at oprette en konto." }),
  })
  .refine((d) => d.password === d.password_repeat, {
    path: ["password_repeat"],
    error: "De to adgangskoder er ikke ens. Skriv den samme adgangskode i begge felter.",
  });

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    password_repeat: z.string(),
  })
  .refine((d) => d.password === d.password_repeat, {
    path: ["password_repeat"],
    error: "De to adgangskoder er ikke ens. Skriv den samme adgangskode i begge felter.",
  });

/** Reads a text field from FormData (missing fields become ""). */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
