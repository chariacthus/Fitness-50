"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodFieldErrors } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { emailMember, trainingPlanEmail } from "@/lib/email";
import { BUCKETS, isAllowedVideo } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { emailOutcomeCode, type EmailOutcome } from "@/lib/admin/email-outcome";
import {
  CHECK_FIELDS_MESSAGE,
  NOT_ADMIN_MESSAGE,
  failForm,
  isUuid,
  nullIfEmpty,
  readText,
  readValues,
  type FormState,
} from "@/lib/admin/forms";
import { loadUploadLimits } from "@/lib/admin/queries";
import { moveItem, nextPosition, parseDirection } from "@/lib/admin/reorder";
import {
  EXERCISE_FIELDS,
  exerciseSchema,
  sessionSchema,
  trainingPlanMetaSchema,
  uploadedVideoSchema,
  type UploadedVideo,
} from "@/lib/admin/schemas";

// Every action re-checks the administrator, loads the record through RLS and
// refuses to change a plan that is not a draft: a published plan is what the
// member sees, so changes go into a new version instead.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PlanRef = { id: string; member_id: string; status: string };
type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

const NOT_DRAFT = "Planen er udgivet eller arkiveret og kan ikke ændres. Lav en ny version, hvis du vil ændre den.";

async function loadPlan(supabase: Supabase, planId: string): Promise<Loaded<PlanRef>> {
  if (!isUuid(planId)) return { ok: false, error: "Planen blev ikke fundet. Genindlæs siden og prøv igen." };
  const { data, error } = await supabase.from("training_plans").select("id, member_id, status").eq("id", planId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data) return { ok: false, error: "Planen blev ikke fundet. Den kan være slettet." };
  return { ok: true, value: data };
}

async function loadDraftPlan(supabase: Supabase, planId: string): Promise<Loaded<PlanRef>> {
  const plan = await loadPlan(supabase, planId);
  if (plan.ok && plan.value.status !== "draft") return { ok: false, error: NOT_DRAFT };
  return plan;
}

async function loadDraftSession(supabase: Supabase, sessionId: string): Promise<Loaded<{ id: string; plan: PlanRef }>> {
  if (!isUuid(sessionId)) return { ok: false, error: "Træningsdagen blev ikke fundet. Genindlæs siden og prøv igen." };
  const { data, error } = await supabase.from("training_sessions").select("id, plan_id").eq("id", sessionId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data) return { ok: false, error: "Træningsdagen blev ikke fundet. Den kan være slettet." };
  const plan = await loadDraftPlan(supabase, data.plan_id);
  return plan.ok ? { ok: true, value: { id: data.id, plan: plan.value } } : plan;
}

async function loadDraftExercise(
  supabase: Supabase,
  exerciseId: string,
): Promise<Loaded<{ id: string; session_id: string; name: string; plan: PlanRef }>> {
  if (!isUuid(exerciseId)) return { ok: false, error: "Øvelsen blev ikke fundet. Genindlæs siden og prøv igen." };
  const { data, error } = await supabase.from("exercises").select("id, session_id, name").eq("id", exerciseId).maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error) };
  if (!data) return { ok: false, error: "Øvelsen blev ikke fundet. Den kan være slettet." };
  const session = await loadDraftSession(supabase, data.session_id);
  return session.ok ? { ok: true, value: { ...data, plan: session.value.plan } } : session;
}

function revalidatePlan(plan: PlanRef) {
  revalidatePath(`/admin/traeningsplaner/${plan.id}`);
  revalidatePath(`/admin/traeningsplaner/${plan.id}/forhaandsvisning`);
  revalidatePath("/admin/traeningsplaner");
  revalidatePath(`/admin/medlemmer/${plan.member_id}`);
}

async function adminClient() {
  const admin = await getAdminOrNull();
  if (!admin) return null;
  return { admin, supabase: await createClient() };
}

// ---- Plan details ------------------------------------------------------------

export async function updatePlanDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, ["title", "goal", "description", "coach_notes"]);
  const parsed = trainingPlanMetaSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error, undefined, values);

  const { error } = await ctx.supabase
    .from("training_plans")
    .update({
      title: parsed.data.title,
      goal: nullIfEmpty(parsed.data.goal),
      description: nullIfEmpty(parsed.data.description),
      coach_notes: nullIfEmpty(parsed.data.coach_notes),
    })
    .eq("id", plan.value.id)
    .eq("status", "draft");
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(plan.value);
  return { ok: true, message: "Planens oplysninger er gemt." };
}

// ---- Training days -----------------------------------------------------------

const SESSION_FIELDS = ["title", "day_label", "description"] as const;

export async function addSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, SESSION_FIELDS);
  const parsed = sessionSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error, undefined, values);

  const { data: existing, error: loadError } = await ctx.supabase.from("training_sessions").select("position").eq("plan_id", plan.value.id);
  if (loadError) return failForm(dbErrorMessage(loadError), undefined, values);

  const { error } = await ctx.supabase.from("training_sessions").insert({
    plan_id: plan.value.id,
    title: parsed.data.title,
    day_label: nullIfEmpty(parsed.data.day_label),
    description: nullIfEmpty(parsed.data.description),
    position: nextPosition(existing ?? []),
  });
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(plan.value);
  return { ok: true, message: `Træningsdagen “${parsed.data.title}” er tilføjet.` };
}

export async function updateSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, SESSION_FIELDS);
  const parsed = sessionSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const session = await loadDraftSession(ctx.supabase, readText(formData, "session_id"));
  if (!session.ok) return failForm(session.error, undefined, values);

  const { error } = await ctx.supabase
    .from("training_sessions")
    .update({
      title: parsed.data.title,
      day_label: nullIfEmpty(parsed.data.day_label),
      description: nullIfEmpty(parsed.data.description),
    })
    .eq("id", session.value.id);
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(session.value.plan);
  return { ok: true, message: "Træningsdagen er gemt." };
}

export async function deleteSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const session = await loadDraftSession(ctx.supabase, readText(formData, "session_id"));
  if (!session.ok) return failForm(session.error);

  const { error } = await ctx.supabase.from("training_sessions").delete().eq("id", session.value.id);
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(session.value.plan);
  return { ok: true, message: "Træningsdagen er slettet." };
}

export async function moveSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const direction = parseDirection(readText(formData, "direction"));
  if (!direction) return failForm("Vælg om træningsdagen skal flyttes op eller ned.");
  const session = await loadDraftSession(ctx.supabase, readText(formData, "session_id"));
  if (!session.ok) return failForm(session.error);

  const { data: siblings, error: loadError } = await ctx.supabase
    .from("training_sessions")
    .select("id, position, created_at")
    .eq("plan_id", session.value.plan.id);
  if (loadError) return failForm(dbErrorMessage(loadError));

  const updates = moveItem(siblings ?? [], session.value.id, direction);
  if (updates.length === 0) return failForm(direction === "up" ? "Træningsdagen er allerede den første." : "Træningsdagen er allerede den sidste.");
  const results = await Promise.all(updates.map((u) => ctx.supabase.from("training_sessions").update({ position: u.position }).eq("id", u.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return failForm(dbErrorMessage(failed.error));

  revalidatePlan(session.value.plan);
  return { ok: true, message: direction === "up" ? "Træningsdagen er flyttet op." : "Træningsdagen er flyttet ned." };
}

// ---- Exercises ---------------------------------------------------------------

function exerciseRow(data: ReturnType<typeof exerciseSchema.parse>) {
  return {
    name: data.name,
    sets: data.sets,
    reps: nullIfEmpty(data.reps),
    duration: nullIfEmpty(data.duration),
    rest: nullIfEmpty(data.rest),
    instructions: nullIfEmpty(data.instructions),
    notes: nullIfEmpty(data.notes),
    video_url: nullIfEmpty(data.video_url),
  };
}

export async function addExercise(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, EXERCISE_FIELDS);
  const parsed = exerciseSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const session = await loadDraftSession(ctx.supabase, readText(formData, "session_id"));
  if (!session.ok) return failForm(session.error, undefined, values);

  const { data: existing, error: loadError } = await ctx.supabase.from("exercises").select("position").eq("session_id", session.value.id);
  if (loadError) return failForm(dbErrorMessage(loadError), undefined, values);

  const { error } = await ctx.supabase
    .from("exercises")
    .insert({ ...exerciseRow(parsed.data), session_id: session.value.id, position: nextPosition(existing ?? []) });
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(session.value.plan);
  return { ok: true, message: `Øvelsen “${parsed.data.name}” er tilføjet.` };
}

export async function updateExercise(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const values = readValues(formData, EXERCISE_FIELDS);
  const parsed = exerciseSchema.safeParse(values);
  if (!parsed.success) return failForm(CHECK_FIELDS_MESSAGE, zodFieldErrors(parsed.error.issues), values);

  const exercise = await loadDraftExercise(ctx.supabase, readText(formData, "exercise_id"));
  if (!exercise.ok) return failForm(exercise.error, undefined, values);

  const { error } = await ctx.supabase.from("exercises").update(exerciseRow(parsed.data)).eq("id", exercise.value.id);
  if (error) return failForm(dbErrorMessage(error), undefined, values);

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: "Øvelsen er gemt." };
}

export async function deleteExercise(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const exercise = await loadDraftExercise(ctx.supabase, readText(formData, "exercise_id"));
  if (!exercise.ok) return failForm(exercise.error);

  const { error } = await ctx.supabase.from("exercises").delete().eq("id", exercise.value.id);
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: `Øvelsen “${exercise.value.name}” er slettet.` };
}

export async function moveExercise(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const direction = parseDirection(readText(formData, "direction"));
  if (!direction) return failForm("Vælg om øvelsen skal flyttes op eller ned.");
  const exercise = await loadDraftExercise(ctx.supabase, readText(formData, "exercise_id"));
  if (!exercise.ok) return failForm(exercise.error);

  const { data: siblings, error: loadError } = await ctx.supabase
    .from("exercises")
    .select("id, position, created_at")
    .eq("session_id", exercise.value.session_id);
  if (loadError) return failForm(dbErrorMessage(loadError));

  const updates = moveItem(siblings ?? [], exercise.value.id, direction);
  if (updates.length === 0) return failForm(direction === "up" ? "Øvelsen er allerede den første." : "Øvelsen er allerede den sidste.");
  const results = await Promise.all(updates.map((u) => ctx.supabase.from("exercises").update({ position: u.position }).eq("id", u.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return failForm(dbErrorMessage(failed.error));

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: direction === "up" ? "Øvelsen er flyttet op." : "Øvelsen er flyttet ned." };
}

// ---- Demonstration videos ------------------------------------------------------

async function discardUpload(supabase: Supabase, path: string) {
  const { error } = await supabase.storage.from(BUCKETS.trainingMedia).remove([path]);
  if (error) console.error("[admin/traeningsplaner] kunne ikke fjerne upload:", error.message);
}

/**
 * Called by the browser after a direct (TUS) upload to training-media/exercises.
 * Checks that the file really is in storage, stores a media row and links it
 * to the exercise.
 */
export async function attachUploadedVideo(input: UploadedVideo): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const parsed = uploadedVideoSchema.safeParse(input);
  if (!parsed.success) return failForm("Videoen kunne ikke gemmes. Prøv at uploade den igen.");
  const { exerciseId, path, mimeType, name } = parsed.data;

  const exercise = await loadDraftExercise(ctx.supabase, exerciseId);
  if (!exercise.ok) {
    await discardUpload(ctx.supabase, path);
    return failForm(exercise.error);
  }

  const fileName = path.slice("exercises/".length);
  const { data: files, error: listError } = await ctx.supabase.storage
    .from(BUCKETS.trainingMedia)
    .list("exercises", { search: fileName, limit: 5 });
  const stored = files?.find((f) => f.name === fileName);
  if (listError || !stored) return failForm("Videoen blev ikke fundet efter uploadet. Prøv at uploade den igen.");

  const meta = (stored.metadata ?? {}) as Record<string, unknown>;
  const size = typeof meta.size === "number" ? meta.size : parsed.data.size;
  const storedType = typeof meta.mimetype === "string" ? meta.mimetype : mimeType;
  const limits = await loadUploadLimits(ctx.supabase);
  if (!isAllowedVideo(storedType) || size > limits.videoBytes) {
    await discardUpload(ctx.supabase, path);
    return failForm("Videoen er for stor eller har et format, der ikke er tilladt.");
  }

  const { data: media, error: mediaError } = await ctx.supabase
    .from("media")
    .insert({
      owner_id: ctx.admin.userId,
      bucket: BUCKETS.trainingMedia,
      path,
      kind: "video",
      mime_type: storedType,
      size_bytes: size,
      title: nullIfEmpty(name.slice(0, 200)),
    })
    .select("id")
    .single();
  if (mediaError || !media) {
    await discardUpload(ctx.supabase, path);
    return failForm(dbErrorMessage(mediaError, "Videoen kunne ikke gemmes. Prøv igen."));
  }

  const { error } = await ctx.supabase.from("exercises").update({ media_id: media.id }).eq("id", exercise.value.id);
  if (error) {
    // Keep things consistent: no media row or file without a use.
    await ctx.supabase.from("media").delete().eq("id", media.id);
    await discardUpload(ctx.supabase, path);
    return failForm(dbErrorMessage(error, "Videoen kunne ikke knyttes til øvelsen. Prøv igen."));
  }

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: `Videoen er knyttet til øvelsen “${exercise.value.name}”.` };
}

export async function chooseExerciseVideo(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const mediaId = readText(formData, "media_id");
  if (!isUuid(mediaId)) return failForm(CHECK_FIELDS_MESSAGE, { media_id: "Vælg en video på listen." });

  const exercise = await loadDraftExercise(ctx.supabase, readText(formData, "exercise_id"));
  if (!exercise.ok) return failForm(exercise.error);

  const { data: media, error: mediaError } = await ctx.supabase
    .from("media")
    .select("id")
    .eq("id", mediaId)
    .eq("bucket", BUCKETS.trainingMedia)
    .eq("kind", "video")
    .maybeSingle();
  if (mediaError) return failForm(dbErrorMessage(mediaError));
  if (!media) return failForm(CHECK_FIELDS_MESSAGE, { media_id: "Videoen findes ikke længere. Vælg en anden." });

  const { error } = await ctx.supabase.from("exercises").update({ media_id: media.id }).eq("id", exercise.value.id);
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: `Videoen er knyttet til øvelsen “${exercise.value.name}”.` };
}

export async function removeExerciseVideo(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const exercise = await loadDraftExercise(ctx.supabase, readText(formData, "exercise_id"));
  if (!exercise.ok) return failForm(exercise.error);

  const { error } = await ctx.supabase.from("exercises").update({ media_id: null }).eq("id", exercise.value.id);
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(exercise.value.plan);
  return { ok: true, message: "Videoen er fjernet fra øvelsen. Den ligger stadig blandt dine videoer og kan vælges igen." };
}

// ---- Publishing, versions, archive, delete ---------------------------------------

export async function publishPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);

  const { count: previous } = await ctx.supabase
    .from("training_plans")
    .select("id", { count: "exact", head: true })
    .eq("member_id", plan.value.member_id)
    .eq("status", "published");

  // Archives an earlier published plan, publishes this one and notifies the member.
  const { error } = await ctx.supabase.rpc("publish_training_plan", { p_plan: plan.value.id });
  if (error) return failForm(dbErrorMessage(error, "Planen kunne ikke udgives. Prøv igen."));

  let email: EmailOutcome;
  try {
    email = await emailMember(plan.value.member_id, (brand, firstName) => trainingPlanEmail(brand, firstName, (previous ?? 0) > 0));
  } catch (e) {
    console.error("[admin/traeningsplaner] e-mail om plan:", e instanceof Error ? e.message : e);
    email = { sent: false, reason: "error" };
  }

  revalidatePlan(plan.value);
  revalidatePath("/admin");
  // The page shows the real e-mail outcome after the redirect.
  redirect(`/admin/traeningsplaner/${plan.value.id}?udgivet=${emailOutcomeCode(email)}`);
}

export async function archivePlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);
  if (plan.value.status !== "published") return failForm("Kun en udgivet plan kan arkiveres.");

  const { error } = await ctx.supabase.rpc("archive_training_plan", { p_plan: plan.value.id });
  if (error) return failForm(dbErrorMessage(error));

  revalidatePlan(plan.value);
  revalidatePath("/admin");
  redirect(`/admin/traeningsplaner/${plan.value.id}?arkiveret=1`);
}

export async function createNewVersion(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);

  // Copies the plan with all training days and exercises into a new draft.
  const { data: newId, error } = await ctx.supabase.rpc("duplicate_training_plan", { p_plan: plan.value.id });
  if (error || !newId) return failForm(dbErrorMessage(error, "Der kunne ikke laves en ny version. Prøv igen."));

  revalidatePlan(plan.value);
  redirect(`/admin/traeningsplaner/${newId}?kopi=1`);
}

export async function deleteDraftPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return failForm(NOT_ADMIN_MESSAGE);
  const plan = await loadDraftPlan(ctx.supabase, readText(formData, "plan_id"));
  if (!plan.ok) return failForm(plan.error);

  const { data, error } = await ctx.supabase.from("training_plans").delete().eq("id", plan.value.id).eq("status", "draft").select("id");
  if (error) return failForm(dbErrorMessage(error));
  if (!data || data.length === 0) return failForm("Kladden kunne ikke slettes. Genindlæs siden og prøv igen.");

  revalidatePlan(plan.value);
  redirect(`/admin/medlemmer/${plan.value.member_id}`);
}
