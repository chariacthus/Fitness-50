"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { siteAssetUrl } from "@/lib/settings";
import { BUCKETS } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";
import { brandContrastWarning } from "@/lib/admin/color";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, isUuid, nullIfEmpty, readText, readValues, type FormState } from "@/lib/admin/forms";
import {
  ADMIN_SETTINGS_FIELDS,
  SITE_IMAGE_FIELDS,
  SITE_SETTINGS_FIELDS,
  adminSettingsSchema,
  siteImageSchema,
  siteSettingsSchema,
  type SiteImageField,
} from "@/lib/admin/schemas";

// After every change the whole site is revalidated, so name, colour and
// images update everywhere (public pages, member area, e-mails).

const SAVED = "Indstillingerne er gemt og vises nu på hele siden.";

function revalidateEverything() {
  revalidatePath("/", "layout");
}

export async function saveSiteSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const values = readValues(formData, SITE_SETTINGS_FIELDS);
  const parsed = siteSettingsSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_settings")
    .update({
      business_name: v.business_name,
      slogan: v.slogan,
      coach_name: v.coach_name,
      coach_badge_label: v.coach_badge_label,
      coach_short_bio: nullIfEmpty(v.coach_short_bio),
      coach_bio: nullIfEmpty(v.coach_bio),
      contact_email: nullIfEmpty(v.contact_email),
      contact_phone: nullIfEmpty(v.contact_phone),
      company_name: nullIfEmpty(v.company_name),
      cvr_number: nullIfEmpty(v.cvr_number),
      company_address: nullIfEmpty(v.company_address),
      brand_color: v.brand_color,
      membership_description: nullIfEmpty(v.membership_description),
      nutrition_description: nullIfEmpty(v.nutrition_description),
      community_welcome_message: v.community_welcome_message,
      updated_by: admin.userId,
    })
    .eq("id", 1)
    .select("id");
  if (error) return failForm(dbErrorMessage(error), undefined, values);
  if (!data || data.length === 0) return failForm("Indstillingerne kunne ikke gemmes. Genindlæs siden og prøv igen.", undefined, values);

  revalidateEverything();
  const warning = brandContrastWarning(v.brand_color);
  return { ok: true, message: warning ? `${SAVED} Bemærk: ${warning}` : SAVED };
}

export async function saveCoachAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const coachId = readText(formData, "coach_user_id");
  if (coachId && !isUuid(coachId)) return failForm(CHECK_FIELDS_MESSAGE, { coach_user_id: "Vælg en konto på listen." });

  const supabase = await createClient();
  if (coachId) {
    const { data: role, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", coachId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) return failForm(dbErrorMessage(roleError));
    if (!role) return failForm(CHECK_FIELDS_MESSAGE, { coach_user_id: "Trænerkontoen skal være en administrator." });
  }

  const { data, error } = await supabase
    .from("site_settings")
    .update({ coach_user_id: coachId || null, updated_by: admin.userId })
    .eq("id", 1)
    .select("id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Trænerkontoen kunne ikke gemmes. Genindlæs siden og prøv igen.");

  revalidateEverything();
  return { ok: true, message: coachId ? "Trænerkontoen er gemt." : "Der er ikke længere valgt en trænerkonto." };
}

export async function saveAdminSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);

  const values = readValues(formData, ADMIN_SETTINGS_FIELDS);
  const parsed = adminSettingsSchema.safeParse({ ...values, email_notifications_enabled: values.email_notifications_enabled === "on" });
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_settings")
    .update({
      grace_period_days: v.grace_period_days,
      email_notifications_enabled: v.email_notifications_enabled,
      admin_notification_email: nullIfEmpty(v.admin_notification_email),
      max_image_mb: v.max_image_mb,
      max_video_mb: v.max_video_mb,
      data_retention_months: v.data_retention_months,
      updated_by: admin.userId,
    })
    .eq("id", 1)
    .select("id");
  if (error) return failForm(dbErrorMessage(error), undefined, values);
  if (!data || data.length === 0) return failForm("Indstillingerne kunne ikke gemmes. Genindlæs siden og prøv igen.", undefined, values);

  revalidateEverything();
  return {
    ok: true,
    message:
      v.max_video_mb > 50
        ? "Indstillingerne er gemt. Husk: Supabase Free-planen tillader højst 50 MB pr. fil, så større videoer kræver en betalt plan."
        : "Indstillingerne er gemt.",
  };
}

async function removeBrandObject(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  if (!path || !path.startsWith("brand/")) return;
  const { error } = await supabase.storage.from(BUCKETS.site).remove([path]);
  if (error) console.error("[admin/indstillinger] kunne ikke fjerne gammelt billede:", error.message);
}

const IMAGE_LABELS: Record<SiteImageField, string> = {
  logo_path: "Logoet",
  coach_photo_path: "Billedet af træneren",
  hero_image_path: "Forsidebilledet",
};

async function publicFileExists(path: string) {
  const url = siteAssetUrl(path);
  if (!url) return false;
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

/** Called by the browser after an image was uploaded to the public "site" bucket. */
export async function saveSiteImage(input: { field: string; path: string }): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const parsed = siteImageSchema.safeParse(input);
  if (!parsed.success) return failForm("Billedet kunne ikke gemmes. Prøv at uploade det igen.");
  const { field, path } = parsed.data;

  // The bucket is public: check that the uploaded file is really there
  // (a one-byte range request, so the image itself is not downloaded).
  if (!(await publicFileExists(path))) return failForm("Billedet blev ikke fundet efter uploadet. Prøv at uploade det igen.");

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase.from("site_settings").select(field).eq("id", 1).maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  const previous = current ? ((current as Record<string, string | null>)[field] ?? null) : null;

  const patch: TablesUpdate<"site_settings"> = { updated_by: admin.userId };
  patch[field] = path;
  const { data, error } = await supabase.from("site_settings").update(patch).eq("id", 1).select("id");
  if (error || !data || data.length === 0) {
    await removeBrandObject(supabase, path);
    return failForm(dbErrorMessage(error, "Billedet kunne ikke gemmes. Prøv igen."));
  }
  if (previous && previous !== path) await removeBrandObject(supabase, previous);

  revalidateEverything();
  return { ok: true, message: `${IMAGE_LABELS[field]} er gemt.` };
}

export async function removeSiteImage(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminOrNull();
  if (!admin) return failForm(NOT_ADMIN_MESSAGE);
  const field = readText(formData, "field");
  if (!(SITE_IMAGE_FIELDS as readonly string[]).includes(field)) return failForm("Ukendt billede.");
  const key = field as SiteImageField;

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase.from("site_settings").select(key).eq("id", 1).maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError));
  const previous = current ? ((current as Record<string, string | null>)[key] ?? null) : null;
  if (!previous) return failForm("Der er ikke valgt et billede.");

  const patch: TablesUpdate<"site_settings"> = { updated_by: admin.userId };
  patch[key] = null;
  const { data, error } = await supabase.from("site_settings").update(patch).eq("id", 1).select("id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Billedet kunne ikke fjernes. Genindlæs siden og prøv igen.");
  await removeBrandObject(supabase, previous);

  revalidateEverything();
  return { ok: true, message: `${IMAGE_LABELS[key]} er fjernet.` };
}
