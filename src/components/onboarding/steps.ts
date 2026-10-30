import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { zodFieldErrors } from "@/lib/action-result";
import {
  LIMITATION_OPTIONS,
  ONBOARDING_STEPS,
  basicSchema,
  environmentSchema,
  goalsSchema,
  healthSchema,
  nutritionAnswersSchema,
  nutritionInterestSchema,
  preferencesSchema,
  timeSchema,
} from "@/lib/onboarding/schema";

// Pure helpers for the multi-step onboarding questionnaire. Used by the
// server actions (validation + merging) and by the pages (step handling).
// No server-only imports: this file is also bundled into the client form.

export const STEP_COUNT = ONBOARDING_STEPS.length;
export const REVIEW_STEP = STEP_COUNT;
/** The step that holds the nutrition questions (linked from the nutrition page). */
export const NUTRITION_STEP = ONBOARDING_STEPS.findIndex((s) => s.key === "nutrition") + 1;

export type StepKey = (typeof ONBOARDING_STEPS)[number]["key"];
export type FormStepKey = Exclude<StepKey, "review">;

export function stepKey(step: number): StepKey {
  return ONBOARDING_STEPS[clampStep(step) - 1].key;
}

export function stepTitle(step: number): string {
  return ONBOARDING_STEPS[clampStep(step) - 1].title;
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.min(STEP_COUNT, Math.max(1, Math.trunc(step)));
}

/** Reads `?trin=` (1..8). Anything else falls back to `fallback`. */
export function parseStep(value: string | string[] | undefined, fallback = 1): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && /^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= STEP_COUNT) return n;
  }
  return clampStep(fallback);
}

/** The step to resume at, from the stored `current_step` (0 = not started). */
export function resumeStep(currentStep: number | null | undefined): number {
  return clampStep(currentStep && currentStep > 0 ? currentStep : 1);
}

export const INTENTS = ["next", "back", "later"] as const;
export type Intent = (typeof INTENTS)[number];

export function parseIntent(value: unknown): Intent {
  return INTENTS.includes(value as Intent) ? (value as Intent) : "next";
}

/** Where the member continues after saving, and what to store as `current_step`. */
export function afterSave(step: number, intent: Intent): { currentStep: number; redirectTo: string } {
  if (intent === "back") {
    const prev = clampStep(step - 1);
    return { currentStep: prev, redirectTo: `/onboarding?trin=${prev}` };
  }
  if (intent === "later") {
    return { currentStep: clampStep(step), redirectTo: "/hjem?onboarding=gemt" };
  }
  const next = clampStep(step + 1);
  return { currentStep: next, redirectTo: `/onboarding?trin=${next}&gemt=1` };
}

// ---- Fields per step --------------------------------------------------------

type FieldKind = "text" | "list" | "flag";
type FieldMap = Record<string, FieldKind>;

export const STEP_FIELDS: Record<FormStepKey, FieldMap> = {
  basic: { full_name: "text", age: "text", training_experience: "text", contact_preference: "text", phone: "text" },
  goals: { goals: "list", goals_other: "text", personal_goal: "text" },
  environment: { environment: "text", equipment: "list", equipment_other: "text" },
  time: { days_per_week: "text", minutes_per_session: "text", session_length_preference: "text", preferred_days: "list" },
  preferences: { current_activity: "text", preferred_exercises: "text", disliked_activities: "text", previous_experience: "text" },
  health: { has_limitations: "text", health_info: "text", health_consent: "flag" },
  nutrition: { nutrition_interest: "text" },
};

/** Extra questions on the nutrition step for members with the nutrition plan add-on. */
export const NUTRITION_FIELDS: FieldMap = {
  meals_per_day: "text",
  diet: "list",
  diet_other: "text",
  foods_avoided: "text",
  cooking_time: "text",
  typical_day: "text",
  nutrition_goal: "text",
};

const STEP_SCHEMAS = {
  basic: basicSchema,
  goals: goalsSchema,
  environment: environmentSchema,
  time: timeSchema,
  preferences: preferencesSchema,
  health: healthSchema,
  nutrition: nutritionInterestSchema,
} satisfies Record<FormStepKey, z.ZodObject>;

/** Columns of their own – never stored inside `answers`. */
export const HEALTH_COLUMNS = ["health_info", "health_consent"] as const;

export type StepValues = Record<string, string | string[] | boolean | undefined>;

type FormDataLike = { get(name: string): unknown; getAll(name: string): unknown[] };

/** Reads the given fields from submitted form data. Empty values become `undefined`. */
export function readFields(formData: FormDataLike, fields: FieldMap): StepValues {
  const out: StepValues = {};
  for (const [name, kind] of Object.entries(fields)) {
    if (kind === "list") {
      out[name] = formData.getAll(name).filter((v): v is string => typeof v === "string" && v !== "");
    } else if (kind === "flag") {
      out[name] = formData.get(name) === "on" || formData.get(name) === "true";
    } else {
      const v = formData.get(name);
      out[name] = typeof v === "string" && v.trim() !== "" ? v : undefined;
    }
  }
  return out;
}

export type ValidationMode = "strict" | "lenient";

export type FieldsValidation =
  | { ok: true; data: Record<string, unknown>; skipped: string[] }
  | { ok: false; fieldErrors: Record<string, string> };

/**
 * strict: the whole schema must pass ("Gem og fortsæt").
 * lenient: every field is checked on its own; valid fields are kept and the
 * rest are skipped, so "Tilbage" and "Gem og fortsæt senere" never throw
 * away what the member already filled in correctly.
 */
export function validateFields(schema: z.ZodObject, fields: FieldMap, input: StepValues, mode: ValidationMode): FieldsValidation {
  if (mode === "strict") {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error.issues) };
    return { ok: true, data: parsed.data as Record<string, unknown>, skipped: [] };
  }
  const data: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const name of Object.keys(fields)) {
    const fieldSchema = schema.shape[name] as z.ZodType | undefined;
    if (!fieldSchema) continue;
    const parsed = fieldSchema.safeParse(input[name]);
    if (parsed.success) data[name] = parsed.data;
    else skipped.push(name);
  }
  return { ok: true, data, skipped };
}

/** Health text and the answer "ja" may only be saved with consent. Checked in every mode. */
function consentError(input: StepValues): string | undefined {
  // Only the consent rules matter here. A missing or unknown answer is replaced
  // by a valid placeholder, so the refinements are always evaluated.
  const answer = LIMITATION_OPTIONS.find((o) => o.value === input.has_limitations)?.value ?? LIMITATION_OPTIONS[0].value;
  const parsed = healthSchema.safeParse({
    has_limitations: answer,
    health_info: input.health_info,
    health_consent: input.health_consent === true,
  });
  return parsed.success ? undefined : zodFieldErrors(parsed.error.issues).health_consent;
}

/** Validates one questionnaire step (1–7). */
export function validateStep(key: FormStepKey, input: StepValues, mode: ValidationMode): FieldsValidation {
  const result = validateFields(STEP_SCHEMAS[key], STEP_FIELDS[key], input, mode);
  if (key !== "health") return result;
  const consent = consentError(input);
  if (!consent) return result;
  return { ok: false, fieldErrors: { ...(result.ok ? {} : result.fieldErrors), health_consent: consent } };
}

export function validateNutritionAnswers(input: StepValues, mode: ValidationMode): FieldsValidation {
  return validateFields(nutritionAnswersSchema, NUTRITION_FIELDS, input, mode);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

/**
 * Merges validated step data into the stored answers. Only the step's own
 * fields are touched: empty values remove the old answer, skipped (invalid)
 * fields keep it. Health columns are never copied into answers.
 */
export function mergeAnswers(
  existing: unknown,
  fields: FieldMap,
  data: Record<string, unknown>,
  skipped: string[] = [],
): Record<string, unknown> {
  const merged = asRecord(existing);
  for (const name of HEALTH_COLUMNS) delete merged[name];
  for (const name of Object.keys(fields)) {
    if ((HEALTH_COLUMNS as readonly string[]).includes(name) || skipped.includes(name)) continue;
    const value = data[name];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) delete merged[name];
    else merged[name] = value;
  }
  return merged;
}

const COMPLETION_SCHEMAS: z.ZodType[] = [
  basicSchema,
  goalsSchema,
  environmentSchema,
  timeSchema,
  preferencesSchema,
  // .pick() is not allowed on refined schemas in zod 4, so build it from the shape.
  z.object({ has_limitations: healthSchema.shape.has_limitations }),
  nutritionInterestSchema,
];

/** First step (1–7) whose required answers are missing or invalid, or null when complete. */
export function firstIncompleteStep(answers: unknown): number | null {
  const a = asRecord(answers);
  for (let i = 0; i < COMPLETION_SCHEMAS.length; i++) {
    if (!COMPLETION_SCHEMAS[i].safeParse(a).success) return i + 1;
  }
  return null;
}

/** describeAnswers() returns sections in step order; the nutrition questionnaire belongs to the nutrition step. */
export function sectionStep(index: number): number {
  return Math.min(index + 1, NUTRITION_STEP);
}

/** Stored answers → values for the form's default state. */
export function toFormValues(source: Record<string, unknown>, fields: FieldMap): StepValues {
  const out: StepValues = {};
  for (const [name, kind] of Object.entries(fields)) {
    const v = source[name];
    if (kind === "list") out[name] = Array.isArray(v) ? v.map(String) : [];
    else if (kind === "flag") out[name] = v === true;
    else out[name] = v == null || v === "" ? undefined : String(v);
  }
  return out;
}

/** State of a step form: the normal result plus what was typed, so nothing is lost on an error. */
export type StepFormState = ActionResult & { values?: StepValues };
export const initialStepState: StepFormState = { ok: false, error: "" };

/** State of the "send" form: which step is incomplete, so the page can link to it. */
export type SubmitFormState = ActionResult & { incompleteStep?: number };
export const initialSubmitState: SubmitFormState = { ok: false, error: "" };

export type PrefillSource = {
  answers: unknown;
  healthInfo?: string | null;
  healthConsent?: boolean | null;
  nutritionAnswers?: unknown;
  /** Used when the questionnaire has no answer yet (step A). */
  profile?: { fullName?: string | null; phone?: string | null; contactPreference?: string | null };
};

/** Form defaults for one step: saved answers first, then the member's profile for step A. */
export function stepDefaults(key: FormStepKey, source: PrefillSource): StepValues {
  const values = asRecord(source.answers);
  let fields = STEP_FIELDS[key];
  if (key === "basic") {
    const p = source.profile ?? {};
    if (values.full_name == null || values.full_name === "") values.full_name = p.fullName?.trim() || undefined;
    if (values.phone == null || values.phone === "") values.phone = p.phone ?? undefined;
    if (values.contact_preference == null) values.contact_preference = p.contactPreference ?? undefined;
  }
  if (key === "health") {
    values.health_info = source.healthInfo ?? undefined;
    values.health_consent = source.healthConsent === true;
  }
  if (key === "nutrition") {
    Object.assign(values, asRecord(source.nutritionAnswers), { nutrition_interest: values.nutrition_interest });
    fields = { ...fields, ...NUTRITION_FIELDS };
  }
  return toFormValues(values, fields);
}
