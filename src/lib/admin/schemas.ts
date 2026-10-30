// Validation for every admin form (zod 4). Limits mirror the database checks
// in supabase/migrations/20261030000001_schema.sql, so a valid form never
// fails on a constraint.

import { z } from "zod";
import { MEAL_TYPES } from "@/lib/training/display";
import { HEX_COLOR, normalizeHex } from "@/lib/admin/color";
import { UUID_PATTERN, isHttpsUrl } from "@/lib/admin/forms";

const optionalText = (max: number, what: string) => z.string().trim().max(max, `${what} må højst være ${max} tegn.`);
const requiredText = (max: number, what: string, missing: string) =>
  z.string().trim().min(1, missing).max(max, `${what} må højst være ${max} tegn.`);

export const idSchema = (message = "Ukendt id. Genindlæs siden og prøv igen.") => z.string().regex(UUID_PATTERN, message);

/** Whole number in a range, entered as text. Empty is not allowed. */
const wholeNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `Skriv et helt tal mellem ${min} og ${max}.`)
    .transform(Number);

const optionalEmail = z
  .string()
  .trim()
  .max(200, "E-mailadressen må højst være 200 tegn.")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Skriv en gyldig e-mailadresse, f.eks. navn@eksempel.dk.");

// ---- Training plans ----------------------------------------------------------

export const trainingPlanMetaSchema = z.object({
  title: requiredText(160, "Titlen", "Skriv en titel på planen."),
  goal: optionalText(1000, "Målet"),
  description: optionalText(6000, "Beskrivelsen"),
  coach_notes: optionalText(6000, "Noterne"),
});

export const newTrainingPlanSchema = z.object({
  member_id: idSchema("Vælg det medlem, planen er til."),
  title: trainingPlanMetaSchema.shape.title,
  goal: trainingPlanMetaSchema.shape.goal,
  description: trainingPlanMetaSchema.shape.description,
});

export const sessionSchema = z.object({
  title: requiredText(160, "Titlen", "Skriv en titel på træningsdagen, f.eks. \"Styrke – hele kroppen\"."),
  day_label: optionalText(60, "Dagen"),
  description: optionalText(4000, "Beskrivelsen"),
});

export const exerciseSchema = z.object({
  name: requiredText(160, "Navnet", "Skriv øvelsens navn."),
  sets: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 50), "Skriv et helt tal mellem 1 og 50, eller lad feltet stå tomt.")
    .transform((v) => (v === "" ? null : Number(v))),
  reps: optionalText(40, "Gentagelser"),
  duration: optionalText(40, "Varigheden"),
  rest: optionalText(40, "Pausen"),
  instructions: optionalText(4000, "Vejledningen"),
  notes: optionalText(2000, "Bemærkningen"),
  video_url: z
    .string()
    .trim()
    .max(2000, "Linket er for langt.")
    .refine((v) => v === "" || isHttpsUrl(v), "Linket skal være en fuld adresse, der starter med https://"),
});

export const EXERCISE_FIELDS = ["name", "sets", "reps", "duration", "rest", "instructions", "notes", "video_url"] as const;

/** Data sent by the browser after a demonstration video has been uploaded. */
export const uploadedVideoSchema = z.object({
  exerciseId: idSchema(),
  path: z.string().regex(/^exercises\/[0-9a-f-]{36}\.(mp4|webm|mov)$/i, "Ugyldig filsti."),
  mimeType: z.enum(["video/mp4", "video/webm", "video/quicktime"], { error: "Vælg en video i formatet MP4, WebM eller MOV." }),
  size: z.number().int().positive(),
  name: z.string().max(500),
});

export type UploadedVideo = { exerciseId: string; path: string; mimeType: string; size: number; name: string };

// ---- Nutrition plans ---------------------------------------------------------

export const nutritionPlanMetaSchema = z.object({
  title: requiredText(160, "Titlen", "Skriv en titel på kostplanen."),
  intro: optionalText(4000, "Introduktionen"),
  meal_structure: optionalText(8000, "Måltidsstrukturen"),
  general_guidance: optionalText(8000, "De generelle råd"),
  personal_notes: optionalText(6000, "De personlige noter"),
});

export const NUTRITION_META_FIELDS = ["title", "intro", "meal_structure", "general_guidance", "personal_notes"] as const;

export const newNutritionPlanSchema = z.object({
  member_id: idSchema("Vælg det medlem, kostplanen er til."),
  title: nutritionPlanMetaSchema.shape.title,
  intro: nutritionPlanMetaSchema.shape.intro,
});

export const mealSchema = z.object({
  meal_type: z.enum(MEAL_TYPES, { error: "Vælg hvornår på dagen måltidet hører til." }),
  title: requiredText(160, "Titlen", "Skriv en titel på måltidet."),
  description: optionalText(4000, "Beskrivelsen"),
});

// ---- Moderation, members, contact ---------------------------------------------

export const suspensionSchema = z
  .object({
    user_id: idSchema(),
    suspend: z.boolean(),
    reason: optionalText(1000, "Begrundelsen"),
  })
  .refine((v) => !v.suspend || v.reason.length > 0, {
    message: "Skriv kort, hvorfor adgangen sættes på pause. Begrundelsen gemmes i loggen.",
    path: ["reason"],
  });

export const grantAddonSchema = z.object({
  user_id: idSchema(),
  note: optionalText(1000, "Noten"),
});

export const resolveReportSchema = z.object({
  report_id: idSchema(),
  status: z.enum(["resolved", "dismissed"], { error: "Vælg om anmeldelsen er løst eller afvist." }),
  note: optionalText(1000, "Noten"),
});

export const moderateMessageSchema = z.object({
  message_id: idSchema(),
  hide: z.boolean(),
  reason: optionalText(1000, "Begrundelsen"),
});

// ---- Settings ----------------------------------------------------------------

export const siteSettingsSchema = z.object({
  business_name: requiredText(80, "Navnet", "Skriv forretningens navn."),
  slogan: optionalText(160, "Sloganet"),
  coach_name: requiredText(80, "Navnet", "Skriv trænerens navn."),
  coach_badge_label: requiredText(60, "Mærkaten", "Skriv teksten på trænermærket, f.eks. \"Christian · Træner\"."),
  coach_short_bio: optionalText(600, "Den korte præsentation"),
  coach_bio: optionalText(6000, "Præsentationen"),
  contact_email: optionalEmail,
  contact_phone: optionalText(40, "Telefonnummeret").refine(
    (v) => v === "" || /^[+\d][\d\s-]{5,}$/.test(v),
    "Skriv telefonnummeret med cifre, f.eks. 12 34 56 78.",
  ),
  company_name: optionalText(160, "Firmanavnet"),
  cvr_number: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine((v) => v === "" || /^\d{8}$/.test(v), "Et CVR-nummer består af 8 cifre."),
  company_address: optionalText(300, "Adressen"),
  brand_color: z
    .string()
    .transform((v) => normalizeHex(v) ?? v.trim())
    .refine((v) => HEX_COLOR.test(v), "Skriv farven som en hex-kode med 6 tegn, f.eks. #4F5D3A."),
  membership_description: optionalText(4000, "Beskrivelsen"),
  nutrition_description: optionalText(4000, "Beskrivelsen"),
  community_welcome_message: requiredText(2000, "Velkomstbeskeden", "Skriv en velkomstbesked til nye medlemmer."),
});

export const SITE_SETTINGS_FIELDS = Object.keys(siteSettingsSchema.shape) as (keyof typeof siteSettingsSchema.shape)[];

export const adminSettingsSchema = z.object({
  grace_period_days: wholeNumber(0, 60),
  email_notifications_enabled: z.boolean(),
  admin_notification_email: optionalEmail,
  max_image_mb: wholeNumber(1, 50),
  max_video_mb: wholeNumber(1, 5000),
  data_retention_months: wholeNumber(1, 120),
});

export const ADMIN_SETTINGS_FIELDS = [
  "grace_period_days",
  "email_notifications_enabled",
  "admin_notification_email",
  "max_image_mb",
  "max_video_mb",
  "data_retention_months",
] as const;

export const SITE_IMAGE_FIELDS = ["logo_path", "coach_photo_path", "hero_image_path"] as const;
export type SiteImageField = (typeof SITE_IMAGE_FIELDS)[number];

export const siteImageSchema = z.object({
  field: z.enum(SITE_IMAGE_FIELDS, { error: "Ukendt billedfelt." }),
  path: z.string().regex(/^brand\/[0-9a-f-]{36}\.(jpg|png|webp)$/i, "Ugyldig filsti."),
});
