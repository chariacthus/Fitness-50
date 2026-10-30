import { z } from "zod";
import { IMAGE_TYPES, VIDEO_TYPES, DEFAULT_LIMITS } from "@/lib/storage";
import { copenhagenLocalToIso } from "@/lib/announcements/datetime";
import { isHttpsLink } from "@/lib/announcements/text";

// Input validation for the announcement admin forms. Limits mirror the
// check constraints on public.announcements and public.media.

export const ANNOUNCEMENT_FIELDS = [
  "title",
  "body",
  "video_title",
  "video_description",
  "location_name",
  "location_address",
  "map_url",
  "is_pinned",
  "is_important",
  "published_at",
] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v ? v : null));

const titleSchema = z.string().trim().min(1, "Skriv en overskrift.").max(200, "Overskriften må højst være 200 tegn.");
const bodySchema = z.string().trim().max(20000, "Teksten må højst være 20.000 tegn.");

export const newAnnouncementSchema = z.object({
  title: titleSchema,
  body: bodySchema,
});

export const announcementFormSchema = z.object({
  title: titleSchema,
  body: bodySchema,
  video_title: optionalText(200, "Videoens titel må højst være 200 tegn."),
  video_description: optionalText(2000, "Beskrivelsen af videoen må højst være 2.000 tegn."),
  location_name: optionalText(200, "Stedets navn må højst være 200 tegn."),
  location_address: optionalText(300, "Adressen må højst være 300 tegn."),
  map_url: z
    .string()
    .trim()
    .max(2000, "Linket er for langt.")
    .refine((v) => v === "" || isHttpsLink(v), "Linket til kortet skal være en hel adresse, der starter med https://")
    .transform((v) => (v ? v : null)),
  is_pinned: z.boolean(),
  is_important: z.boolean(),
  published_at: z
    .string()
    .trim()
    .refine((v) => v === "" || copenhagenLocalToIso(v) !== null, "Vælg en gyldig dato og et gyldigt klokkeslæt.")
    .transform((v) => (v ? copenhagenLocalToIso(v) : null)),
});

export type AnnouncementFormValues = z.infer<typeof announcementFormSchema>;

export const intentSchema = z.enum(["save", "publish", "unpublish"]);

export const ANNOUNCEMENT_LIMITS = {
  imageBytes: DEFAULT_LIMITS.imageBytes,
  videoBytes: DEFAULT_LIMITS.videoBytes,
} as const;

/** A file the browser has uploaded to announcements/<announcement id>/… */
export const attachMediaSchema = z
  .object({
    announcementId: z.guid("Opslaget blev ikke fundet."),
    path: z.string().min(1).max(300),
    mimeType: z.enum([...IMAGE_TYPES, ...VIDEO_TYPES], { error: "Filtypen er ikke tilladt." }),
    size: z.number().int().nonnegative(),
  })
  .refine((v) => v.path.startsWith(`${v.announcementId}/`) && !v.path.includes(".."), {
    path: ["path"],
    error: "Filen ligger det forkerte sted. Prøv at uploade den igen.",
  })
  .refine(
    (v) =>
      (IMAGE_TYPES as readonly string[]).includes(v.mimeType)
        ? v.size <= ANNOUNCEMENT_LIMITS.imageBytes
        : v.size <= ANNOUNCEMENT_LIMITS.videoBytes,
    { path: ["size"], error: "Filen er for stor." },
  );

export const mediaRefSchema = z.object({
  announcementId: z.guid("Opslaget blev ikke fundet."),
  mediaId: z.guid("Filen blev ikke fundet."),
});

export const mediaMoveSchema = mediaRefSchema.extend({ direction: z.enum(["up", "down"]) });

export const mediaTitleSchema = mediaRefSchema.extend({
  title: optionalText(200, "Beskrivelsen må højst være 200 tegn."),
});
