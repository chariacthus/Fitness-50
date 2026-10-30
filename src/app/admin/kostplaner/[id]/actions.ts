"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { emailMember, genericNoticeEmail } from "@/lib/email";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { emailOutcomeCode, type EmailOutcome } from "@/lib/admin/email-outcome";
import { CHECK_FIELDS_MESSAGE, NOT_ADMIN_MESSAGE, failForm, isUuid, nullIfEmpty, readText, readValues, type FormState } from "@/lib/admin/forms";
import { moveItem, nextPosition, parseDirection } from "@/lib/admin/reorder";
import { NUTRITION_META_FIELDS, mealSchema, nutritionPlanMetaSchema } from "@/lib/admin/schemas";

// Same rules as the training plan editor: admin check in every action, records
// loaded through RLS, and only drafts can be changed.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PlanRef = { id: string; member_id: string; status: string };
type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

const NOT_DRAFT = "Kostplanen er udgivet eller arkiveret og kan ikke ændres. Lav en ny version, hvis du vil ændre den.";
const MEAL_FIELDS = ["meal_type", "title", "description"] as const;

async function adminClient() {
  const admin = await getAdminOrNull();
  if (!admin) return null;
  return { admin, supabase: await createClient() };
}

async function loadPlan(supabase: Supabase, planId: string): Promise<Loaded<PlanRef>> {
  if (!isUuid(planId)) return { ok: false, error: "Kostplanen blev ikke fundet. Genindlæs siden og prøv igen." };
  const { data, error } = await supabase.from("nutrition_plans").select("id, member_id, status").eq("id", planId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data) return { ok: false, error: "Kostplanen blev ikke fundet. Den kan være slettet." };
  return { ok: true, value: data };
}

async function loadDraftPlan(supabase: Supabase, planId: string): Promise<Loaded<PlanRef>> {
  const plan = await loadPlan(supabase, planId);
  if (plan.ok && plan.value.status !== "draft") return { ok: false, error: NOT_DRAFT };
  return plan;
}

async function loadDraftMeal(supabase: Supabase, mealId: string): Promise<Loaded<{ id: string; title: string; meal_type: string; plan: PlanRef }>> {
  if (!isUuid(mealId)) return { ok: false, error: "Måltidet blev ikke fundet. Genindlæs siden og prøv igen." };
  const { data, error } = await supabase.from("nutrition_meals").select("id, plan_id, title, meal_type").eq("id", mealId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data) return { ok: false, error: "Måltidet blev ikke fundet. Det kan være slettet." };
  const plan = await loadDraftPlan(supabase, data.plan_id);
  return plan.ok ? { ok: true, value: { id: data.id, title: data.title, meal_type: data.meal_type, plan: plan.value } } : plan;
}

function revalidatePlan(plan: PlanRef) {
  revalidatePath(`/admin/kostplaner/${plan.id}`);
  revalidatePath(`/admin/kostplaner/${plan.id}/forhaandsvisning`);
  revalidatePath("/admin/kostplaner");
  revalidatePath(`/admin/medlemmer/${plan.member_id}`);
}

export async function updateNutritionDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, NUTRITION_META_FIELDS);
  const parsed = nutritionPlanMetaSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error, undefined, values);

  const { error } = await ctx.supabase
    .from("nutrition_plans")
    .update({
      title: parsed.data.title,
      intro: nullIfEmpty(parsed.data.intro),
      meal_structure: nullIfEmpty(parsed.data.meal_structure),
      general_guidance: nullIfEmpty(parsed.data.general_guidance),
      personal_notes: nullIfEmpty(parsed.data.personal_notes),
    })
    .eq("id", plan.value.id)
    .eq("status", "draft");
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(plan.value);
  return { ok: true, message: "Kostplanens tekster er gemt." };
}

export async function addMeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, MEAL_FIELDS);
  const parsed = mealSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error, undefined, values);

  // Meals are shown grouped by time of day, so order is kept per meal type.
  const { data: existing, error: loadError } = await ctx.supabase
    .from("nutrition_meals")
    .select("position")
    .eq("plan_id", plan.value.id)
    .eq("meal_type", parsed.data.meal_type);
  if (loadError) return failForm(dbErrorMessage(loadError), undefined, values);

  const { error } = await ctx.supabase.from("nutrition_meals").insert({
    plan_id: plan.value.id,
    meal_type: parsed.data.meal_type,
    title: parsed.data.title,
    description: nullIfEmpty(parsed.data.description),
    position: nextPosition(existing ?? []),
  });
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(plan.value);
  return { ok: true, message: `Måltidet “${parsed.data.title}” er tilføjet.` };
}

export async function updateMeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, MEAL_FIELDS);
  const parsed = mealSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const meal = await loadDraftMeal(ctx.supabase, readText(formData, "meal_id"));
  if (!meal.ok) return failForm(meal.error, undefined, values);

  let position: number | undefined;
  if (parsed.data.meal_type !== meal.value.meal_type) {
    // Moving to another time of day: place it last in that group.
    const { data: existing, error: loadError } = await ctx.supabase
      .from("nutrition_meals")
      .select("position")
      .eq("plan_id", meal.value.plan.id)
      .eq("meal_type", parsed.data.meal_type);
    if (loadError) return failForm(dbErrorMessage(loadError), undefined, values);
    position = nextPosition(existing ?? []);
  }

  const { error } = await ctx.supabase
    .from("nutrition_meals")
    .update({
      meal_type: parsed.data.meal_type,
      title: parsed.data.title,
      description: nullIfEmpty(parsed.data.description),
      ...(position !== undefined ? { position } : {}),
    })
    .eq("id", meal.value.id);
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(meal.value.plan);
  return { ok: true, message: "Måltidet er gemt." };
}

export async function deleteMeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const meal = await loadDraftMeal(ctx.supabase, readText(formData, "meal_id"));
  if (!meal.ok) return failForm(meal.error);

  const { error } = await ctx.supabase.from("nutrition_meals").delete().eq("id", meal.value.id);
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(meal.value.plan);
  return { ok: true, message: `Måltidet “${meal.value.title}” er slettet.` };
}

export async function moveMeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const direction = parseDirection(readText(formData, "direction"));
  if (!direction) return failForm("Vælg om måltidet skal flyttes op eller ned.");
  const meal = await loadDraftMeal(ctx.supabase, readText(formData, "meal_id"));
  if (!meal.ok) return failForm(meal.error);

  const { data: siblings, error: loadError } = await ctx.supabase
    .from("nutrition_meals")
    .select("id, position, created_at")
    .eq("plan_id", meal.value.plan.id)
    .eq("meal_type", meal.value.meal_type);
  if (loadError) return failForm(dbErrorMessage(loadError));

  const updates = moveItem(siblings ?? [], meal.value.id, direction);
  if (updates.length === 0) return failForm(direction === "up" ? "Måltidet er allerede det første." : "Måltidet er allerede det sidste.");
  const results = await Promise.all(updates.map((u) => ctx.supabase.from("nutrition_meals").update({ position: u.position }).eq("id", u.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return failForm(dbErrorMessage(failed.error));

  revalidatePlan(meal.value.plan);
  return { ok: true, message: direction === "up" ? "Måltidet er flyttet op." : "Måltidet er flyttet ned." };
}

export async function publishNutritionPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);

  // Refuses (with a Danish message) when the member has no access to the add-on.
  const { error } = await ctx.supabase.rpc("publish_nutrition_plan", { p_plan: plan.value.id });
  if (error) return failForm(dbErrorMessage(error, "Kostplanen kunne ikke udgives. Prøv igen."));

  let email: EmailOutcome;
  try {
    const settings = await getSiteSettings();
    email = await emailMember(plan.value.member_id, (brand, firstName) =>
      genericNoticeEmail(
        brand,
        "Din kostplan er klar",
        [`Hej${firstName ? ` ${firstName}` : ""}. ${settings.coach_name} har lavet din personlige kostplan.`, "Log ind for at se den under Min træning."],
        { label: "Se min kostplan", path: "/min-traening/kostplan" },
      ),
    );
  } catch (e) {
    console.error("[admin/kostplaner] e-mail om kostplan:", e instanceof Error ? e.message : e);
    email = { sent: false, reason: "error" };
  }

  revalidatePlan(plan.value);
  revalidatePath("/admin");
  redirect(`/admin/kostplaner/${plan.value.id}?udgivet=${emailOutcomeCode(email)}`);
}

export async function archiveNutritionPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);
  if (plan.value.status !== "published") return failForm("Kun en udgivet kostplan kan arkiveres.");

  const { error } = await ctx.supabase.rpc("archive_nutrition_plan", { p_plan: plan.value.id });
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(plan.value);
  revalidatePath("/admin");
  redirect(`/admin/kostplaner/${plan.value.id}?arkiveret=1`);
}

/** Copies the plan and its meals into a new draft for the same member. */
export async function createNutritionVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const ref = await loadPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!ref.ok) return failForm(ref.error);

  const [{ data: source, error: sourceError }, { data: meals, error: mealsError }] = await Promise.all([
    ctx.supabase.from("nutrition_plans").select("*").eq("id", ref.value.id).single(),
    ctx.supabase.from("nutrition_meals").select("meal_type, title, description, position").eq("plan_id", ref.value.id),
  ]);
  if (sourceError || mealsError || !source) return failForm(dbErrorMessage(sourceError ?? mealsError));

  const { data: copy, error: insertError } = await ctx.supabase
    .from("nutrition_plans")
    .insert({
      member_id: source.member_id,
      title: source.title,
      intro: source.intro,
      meal_structure: source.meal_structure,
      general_guidance: source.general_guidance,
      personal_notes: source.personal_notes,
      status: "draft",
      created_by: ctx.admin.userId,
    })
    .select("id")
    .single();
  if (insertError || !copy) return failForm(dbErrorMessage(insertError, "Der kunne ikke laves en ny version. Prøv igen."));

  if (meals && meals.length > 0) {
    const { error: copyError } = await ctx.supabase.from("nutrition_meals").insert(meals.map((m) => ({ ...m, plan_id: copy.id })));
    if (copyError) {
      // Do not leave a half-copied draft behind.
      await ctx.supabase.from("nutrition_plans").delete().eq("id", copy.id);
      return failForm(dbErrorMessage(copyError, "Måltiderne kunne ikke kopieres. Prøv igen."));
    }
  }

  revalidatePlan(ref.value);
  redirect(`/admin/kostplaner/${copy.id}?kopi=1`);
}

export async function deleteNutritionDraft(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);

  const { data, error } = await ctx.supabase.from("nutrition_plans").delete().eq("id", plan.value.id).eq("status", "draft").select("id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Kladden kunne ikke slettes. Genindlæs siden og prøv igen.");

  revalidatePlan(plan.value);
  redirect(`/admin/medlemmer/${plan.value.member_id}`);
}
