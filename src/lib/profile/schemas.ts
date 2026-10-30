import { z } from "zod";
import { emailSchema, newPasswordSchema } from "@/lib/auth-flow/schemas";
import { authErrorKind, translateAuthError } from "@/lib/auth-flow/errors";

// Input validation for the forms on /min-profil. Limits mirror the database.

export const PROFILE_FIELDS = ["full_name", "bio", "phone", "contact_preference"] as const;

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Skriv dit navn.").max(120, "Navnet må højst være 120 tegn."),
  bio: z
    .string()
    .trim()
    .max(500, "Teksten om dig må højst være 500 tegn.")
    .transform((v) => (v ? v : null)),
  phone: z
    .string()
    .trim()
    .max(40, "Telefonnummeret er for langt.")
    .refine((v) => v === "" || /^\+?[0-9 ()-]{6,40}$/.test(v), "Skriv et telefonnummer med cifre, fx 12 34 56 78.")
    .transform((v) => (v ? v : null)),
  contact_preference: z
    .enum(["", "email", "telefon", "beskeder"], { error: "Vælg en af mulighederne." })
    .transform((v) => (v ? v : null)),
});

export const changePasswordSchema = z
  .object({
    password: newPasswordSchema,
    password_repeat: z.string(),
  })
  .refine((d) => d.password === d.password_repeat, {
    path: ["password_repeat"],
    error: "De to adgangskoder er ikke ens. Skriv den samme adgangskode i begge felter.",
  });

export const changeEmailSchema = z.object({ email: emailSchema });

export const avatarPathSchema = z.string().min(1).max(300);

/** True when an avatar object path lies in the user's own folder ("<userId>/<file>"). */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  if (!path.startsWith(`${userId}/`)) return false;
  const rest = path.slice(userId.length + 1);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}

/** Danish message for a failed password/e-mail change on the profile page. */
export function profileAuthErrorMessage(error: unknown): string {
  if (authErrorKind(error) === "reauthentication_needed") {
    return "Af sikkerhedshensyn skal du logge ind igen, før du kan skifte adgangskode. Log ud, log ind igen, og prøv så igen – eller brug “Glemt adgangskode” på login-siden.";
  }
  return translateAuthError(error);
}
