// Pure display helpers for training and nutrition plans (Danish labels).

export type ExerciseNumbers = {
  sets: number | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
};

/** Sets × reps, duration and rest as label/value pairs. Missing values are left out. */
export function exerciseFacts(ex: ExerciseNumbers): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const reps = ex.reps?.trim();
  if (ex.sets && reps) facts.push({ label: "Sæt × gentagelser", value: `${ex.sets} × ${reps}` });
  else if (ex.sets) facts.push({ label: "Sæt", value: String(ex.sets) });
  else if (reps) facts.push({ label: "Gentagelser", value: reps });
  if (ex.duration?.trim()) facts.push({ label: "Varighed", value: ex.duration.trim() });
  if (ex.rest?.trim()) facts.push({ label: "Pause", value: ex.rest.trim() });
  return facts;
}

export const MEAL_TYPES = ["morgenmad", "formiddag", "frokost", "eftermiddag", "aftensmad", "aften", "andet"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  morgenmad: "Morgenmad",
  formiddag: "Formiddag",
  frokost: "Frokost",
  eftermiddag: "Eftermiddag",
  aftensmad: "Aftensmad",
  aften: "Sen aften",
  andet: "Andre måltider",
};

type MealLike = { meal_type: string; position: number };

/** Groups meals by type in the order of the day; empty groups are left out. */
export function groupMeals<T extends MealLike>(meals: readonly T[]): { type: MealType; label: string; meals: T[] }[] {
  const known = (t: string): MealType => ((MEAL_TYPES as readonly string[]).includes(t) ? (t as MealType) : "andet");
  return MEAL_TYPES.map((type) => ({
    type,
    label: MEAL_TYPE_LABELS[type],
    meals: meals.filter((m) => known(m.meal_type) === type).sort((a, b) => a.position - b.position),
  })).filter((g) => g.meals.length > 0);
}

/** Collapses whitespace and shortens text at a word boundary. */
export function excerpt(text: string | null | undefined, max = 180) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:–-]+$/, "")}…`;
}

/** Internal links only (notification links are stored as "/path"). */
export function safeInternalLink(link: string | null | undefined) {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
