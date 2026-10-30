"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail } from "@/lib/action-result";
import { getViewer } from "@/lib/auth";
import type { Json, TablesUpdate } from "@/lib/database.types";
import { genericNoticeEmail, sendEmail } from "@/lib/email";
import { onboardingAnswersSchema } from "@/lib/onboarding/schema";
import { getSiteSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  NUTRITION_FIELDS,
  REVIEW_STEP,
  STEP_FIELDS,
  STEP_COUNT,
  afterSave,
  asRecord,
  firstIncompleteStep,
  mergeAnswers,
  parseIntent,
  readFields,
  stepKey,
  stepTitle,
  validateNutritionAnswers,
  validateStep,
  type FormStepKey,
  type StepFormState,
  type StepValues,
  type SubmitFormState,
} from "@/components/onboarding/steps";

const stepNumberSchema = z.coerce.number().int().min(1).max(STEP_COUNT - 1);
const CHECK_FIELDS = "Nogle svar mangler eller skal rettes. Se de markerede felter.";
const SAVE_FAILED = "Dine svar kunne ikke gemmes. Prøv igen.";

async function entitledViewer() {
  const viewer = await getViewer();
  if (!viewer) return { error: "Du er ikke logget ind længere. Log ind igen, og prøv igen." } as const;
  if (!viewer.isEntitled) return { error: "Du skal have et aktivt medlemskab for at udfylde spørgeskemaet." } as const;
  return { viewer } as const;
}

function revalidateMemberPages() {
  revalidatePath("/onboarding");
  revalidatePath("/hjem");
  revalidatePath("/min-traening");
}

/**
 * Saves one step of the questionnaire into the member's own submission (RLS)
 * and keeps it as a draft, so progress survives if the member leaves.
 * "Gem og fortsæt" validates the whole step; "Tilbage" and "Gem og fortsæt
 * senere" keep what is valid and never block the member.
 */
export async function saveStep(_prev: StepFormState, formData: FormData): Promise<StepFormState> {
  const parsedStep = stepNumberSchema.safeParse(formData.get("step"));
  if (!parsedStep.success) return fail("Trinnet blev ikke genkendt. Genindlæs siden, og prøv igen.");
  const step = parsedStep.data;
  const key = stepKey(step) as FormStepKey;
  const intent = parseIntent(formData.get("intent"));
  const mode = intent === "next" ? "strict" : "lenient";

  const fields = STEP_FIELDS[key];
  const input = readFields(formData, fields);

  const auth = await entitledViewer();
  if ("error" in auth) return { ...fail(auth.error), values: input };
  const { viewer } = auth;
  const supabase = await createClient();

  // Nutrition questions only for members who bought or were granted the add-on.
  let nutritionInput: StepValues = {};
  let hasNutritionAddon = false;
  if (key === "nutrition") {
    const { data } = await supabase.rpc("has_addon", { p_slug: "kostplan" });
    hasNutritionAddon = data === true;
    if (hasNutritionAddon) nutritionInput = readFields(formData, NUTRITION_FIELDS);
  }
  const values = { ...input, ...nutritionInput };

  const result = validateStep(key, input, mode);
  const nutrition = hasNutritionAddon ? validateNutritionAnswers(nutritionInput, mode) : null;
  if (!result.ok || (nutrition && !nutrition.ok)) {
    const fieldErrors = { ...(result.ok ? {} : result.fieldErrors), ...(nutrition && !nutrition.ok ? nutrition.fieldErrors : {}) };
    return { ...fail(CHECK_FIELDS, fieldErrors), values };
  }

  const { data: existing, error: loadError } = await supabase
    .from("onboarding_submissions")
    .select("id, answers, nutrition_answers")
    .eq("user_id", viewer.userId)
    .maybeSingle();
  if (loadError) return { ...fail(dbErrorMessage(loadError, SAVE_FAILED)), values };

  const { currentStep, redirectTo } = afterSave(step, intent);
  const patch: TablesUpdate<"onboarding_submissions"> = {
    status: "draft",
    current_step: currentStep,
    answers: mergeAnswers(existing?.answers, fields, result.data, result.skipped) as Json,
  };
  if (key === "health") {
    const consent = result.data.health_consent === true;
    const text = typeof result.data.health_info === "string" ? result.data.health_info.trim() : "";
    patch.health_consent = consent;
    // Without consent nothing is stored (the database also enforces this).
    patch.health_info = consent && text ? text : null;
  }
  if (nutrition?.ok) {
    patch.nutrition_answers = mergeAnswers(existing?.nutrition_answers, NUTRITION_FIELDS, nutrition.data, nutrition.skipped) as Json;
  }

  const saved = existing
    ? await supabase.from("onboarding_submissions").update(patch).eq("id", existing.id).select("id").maybeSingle()
    : await supabase
        .from("onboarding_submissions")
        .insert({ ...patch, user_id: viewer.userId })
        .select("id")
        .maybeSingle();
  if (saved.error || !saved.data) return { ...fail(dbErrorMessage(saved.error, SAVE_FAILED)), values };

  // Step A: keep the profile in sync (own rows, RLS).
  if (key === "basic") {
    const d = result.data;
    const skipped = new Set(result.skipped);
    const profilePatch = !skipped.has("full_name") && typeof d.full_name === "string" ? { full_name: d.full_name } : null;
    const privatePatch: TablesUpdate<"profile_private"> = {};
    if (!skipped.has("phone")) privatePatch.phone = typeof d.phone === "string" && d.phone ? d.phone : null;
    if (!skipped.has("contact_preference") && typeof d.contact_preference === "string") {
      privatePatch.contact_preference = d.contact_preference;
    }
    const [profileRes, privateRes] = await Promise.all([
      profilePatch ? supabase.from("profiles").update(profilePatch).eq("id", viewer.userId) : Promise.resolve({ error: null }),
      Object.keys(privatePatch).length > 0
        ? supabase.from("profile_private").update(privatePatch).eq("user_id", viewer.userId)
        : Promise.resolve({ error: null }),
    ]);
    if (profileRes.error || privateRes.error) {
      revalidateMemberPages();
      return {
        ...fail("Dine svar er gemt, men navn, telefon eller kontaktform kunne ikke opdateres på din profil. Prøv igen."),
        values,
      };
    }
  }

  revalidateMemberPages();
  redirect(redirectTo);
}

/** Sends the finished questionnaire to the coach. The database trigger notifies administrators in-app. */
export async function submitOnboarding(_prev: SubmitFormState): Promise<SubmitFormState> {
  const auth = await entitledViewer();
  if ("error" in auth) return fail(auth.error);
  const { viewer } = auth;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("onboarding_submissions")
    .select("id, answers")
    .eq("user_id", viewer.userId)
    .maybeSingle();
  if (error) return fail(dbErrorMessage(error, "Skemaet kunne ikke sendes. Prøv igen."));
  if (!row) return { ...fail("Du har ikke udfyldt spørgeskemaet endnu."), incompleteStep: 1 };

  const answers = asRecord(row.answers);
  const incomplete = firstIncompleteStep(answers);
  if (incomplete !== null || !onboardingAnswersSchema.safeParse(answers).success) {
    const n = incomplete ?? 1;
    return { ...fail(`Trin ${n} – ${stepTitle(n)} er ikke udfyldt helt. Udfyld det, og send så igen.`), incompleteStep: n };
  }

  const { data: updated, error: updateError } = await supabase
    .from("onboarding_submissions")
    .update({ status: "submitted", current_step: REVIEW_STEP })
    .eq("id", row.id)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) return fail(dbErrorMessage(updateError, "Skemaet kunne ikke sendes. Prøv igen."));

  // Best effort: a generic e-mail to the coach – never answers or health information.
  try {
    const admin = createAdminClient();
    const { data: adminSettings } = await admin
      .from("admin_settings")
      .select("email_notifications_enabled, admin_notification_email")
      .eq("id", 1)
      .maybeSingle();
    const to = adminSettings?.admin_notification_email?.trim();
    if (adminSettings?.email_notifications_enabled && to) {
      const settings = await getSiteSettings();
      await sendEmail({
        to,
        ...genericNoticeEmail(
          { businessName: settings.business_name, brandColor: settings.brand_color },
          "Nyt onboardingskema",
          ["Et medlem har udfyldt onboardingskemaet. Log ind for at se svarene."],
          { label: "Log ind og se svarene", path: "/admin/onboarding" },
        ),
      });
    }
  } catch {
    // The questionnaire is submitted and the in-app notification exists; e-mail is optional.
  }

  revalidateMemberPages();
  revalidatePath("/admin/onboarding");
  redirect("/onboarding?sendt=1");
}

const reopenSchema = z.coerce.number().int().min(1).max(STEP_COUNT);

/** "Ret mine svar": turns a sent questionnaire back into a draft. It is sent again with "Send igen". */
export async function reopenOnboarding(_prev: SubmitFormState, formData: FormData): Promise<SubmitFormState> {
  const auth = await entitledViewer();
  if ("error" in auth) return fail(auth.error);
  const { viewer } = auth;
  const target = reopenSchema.safeParse(formData.get("trin"));
  const step = target.success ? target.data : REVIEW_STEP;

  const supabase = await createClient();
  // Matches nothing if it is already a draft (e.g. opened in another tab) – then editing just continues.
  const { error } = await supabase
    .from("onboarding_submissions")
    .update({ status: "draft", current_step: step })
    .eq("user_id", viewer.userId)
    .in("status", ["submitted", "reviewed"]);
  if (error) return fail(dbErrorMessage(error, "Dine svar kunne ikke åbnes for ændringer. Prøv igen."));
  revalidateMemberPages();
  redirect(`/onboarding?trin=${step}`);
}
