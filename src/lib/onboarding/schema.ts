import { z } from "zod";

// Shared contract for the onboarding questionnaire: used by the member form
// (validation per step) and by the admin views (labels + readable answers).
// Health information is NOT part of `answers`; it is stored separately in
// onboarding_submissions.health_info and only with explicit consent.

export const EXPERIENCE_OPTIONS = [
  { value: "ingen", label: "Ingen eller næsten ingen erfaring" },
  { value: "lidt", label: "Lidt – jeg har trænet en gang imellem" },
  { value: "nogen", label: "En del – jeg har trænet jævnligt tidligere" },
  { value: "meget", label: "Meget – jeg træner jævnligt nu" },
] as const;

export const CONTACT_OPTIONS = [
  { value: "beskeder", label: "Beskeder her på siden" },
  { value: "email", label: "E-mail" },
  { value: "telefon", label: "Telefon" },
] as const;

export const GOAL_OPTIONS = [
  { value: "styrke", label: "Blive stærkere" },
  { value: "vaegttab", label: "Tabe mig" },
  { value: "kondition", label: "Få bedre kondition" },
  { value: "energi", label: "Få mere energi" },
  { value: "bevaegelighed", label: "Forbedre bevægelighed" },
  { value: "aktiv_hverdag", label: "Blive mere aktiv i hverdagen" },
  { value: "komme_i_gang", label: "Komme i gang med træning igen" },
  { value: "andet", label: "Andet" },
] as const;

export const ENVIRONMENT_OPTIONS = [
  { value: "fitnesscenter", label: "Fitnesscenter" },
  { value: "hjemme", label: "Hjemmetræning" },
  { value: "udendoers", label: "Udendørs træning" },
  { value: "kombination", label: "En kombination af flere muligheder" },
] as const;

export const EQUIPMENT_OPTIONS = [
  { value: "intet", label: "Intet udstyr" },
  { value: "haandvaegte", label: "Håndvægte" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "elastikker", label: "Træningselastikker" },
  { value: "baenk", label: "Træningsbænk" },
  { value: "kondimaskine", label: "Motionscykel, romaskine eller løbebånd" },
  { value: "fitness_fuldt", label: "Fuldt udstyret fitnesscenter" },
] as const;

export const MINUTES_OPTIONS = [
  { value: "15-20", label: "15–20 minutter" },
  { value: "30", label: "Omkring 30 minutter" },
  { value: "45", label: "Omkring 45 minutter" },
  { value: "60", label: "Omkring 1 time" },
  { value: "60+", label: "Mere end 1 time" },
] as const;

export const SESSION_LENGTH_OPTIONS = [
  { value: "kortere", label: "Kortere træningspas, gerne oftere" },
  { value: "laengere", label: "Længere træningspas, færre gange" },
  { value: "ingen", label: "Det er lige meget" },
] as const;

export const WEEKDAY_OPTIONS = [
  { value: "mandag", label: "Mandag" },
  { value: "tirsdag", label: "Tirsdag" },
  { value: "onsdag", label: "Onsdag" },
  { value: "torsdag", label: "Torsdag" },
  { value: "fredag", label: "Fredag" },
  { value: "loerdag", label: "Lørdag" },
  { value: "soendag", label: "Søndag" },
] as const;

export const LIMITATION_OPTIONS = [
  { value: "nej", label: "Nej, ikke noget Christian skal tage hensyn til" },
  { value: "ja", label: "Ja, der er noget Christian bør vide" },
  { value: "vil_ikke_oplyse", label: "Det vil jeg helst ikke skrive her" },
] as const;

export const NUTRITION_INTEREST_OPTIONS = [
  { value: "ja", label: "Ja, det er jeg interesseret i" },
  { value: "maaske", label: "Måske – jeg vil gerne høre mere" },
  { value: "nej", label: "Nej tak, ikke lige nu" },
] as const;

export const DIET_OPTIONS = [
  { value: "alt", label: "Jeg spiser det meste" },
  { value: "vegetar", label: "Vegetar" },
  { value: "pescetar", label: "Pescetar (fisk, men ikke kød)" },
  { value: "uden_laktose", label: "Uden laktose" },
  { value: "uden_gluten", label: "Uden gluten" },
  { value: "andet", label: "Andet" },
] as const;

export const MEALS_OPTIONS = [
  { value: "2", label: "2 måltider" },
  { value: "3", label: "3 måltider" },
  { value: "4", label: "4 måltider" },
  { value: "5+", label: "5 eller flere" },
] as const;

export const COOKING_OPTIONS = [
  { value: "lidt", label: "Helst under 15 minutter" },
  { value: "middel", label: "15–30 minutter" },
  { value: "meget", label: "Jeg kan godt lide at lave mad" },
] as const;

type Options = readonly { value: string; label: string }[];
const values = <T extends Options>(options: T) => options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]];

const optionalText = (max: number) => z.string().trim().max(max, `Højst ${max} tegn`).optional().or(z.literal(""));

// ---- Step schemas -----------------------------------------------------------

export const basicSchema = z.object({
  full_name: z.string().trim().min(2, "Skriv dit fulde navn").max(120, "Navnet er for langt"),
  age: z.coerce.number({ error: "Skriv din alder som et tal" }).int("Skriv din alder som et helt tal").min(18, "Alderen skal være mindst 18").max(110, "Tjek venligst alderen").optional(),
  training_experience: z.enum(values(EXPERIENCE_OPTIONS), { error: "Vælg din træningserfaring" }),
  contact_preference: z.enum(values(CONTACT_OPTIONS), { error: "Vælg hvordan Christian bedst kontakter dig" }),
  phone: optionalText(40),
});

export const goalsSchema = z.object({
  goals: z.array(z.enum(values(GOAL_OPTIONS))).min(1, "Vælg mindst ét mål"),
  goals_other: optionalText(300),
  personal_goal: optionalText(1000),
});

export const environmentSchema = z.object({
  environment: z.enum(values(ENVIRONMENT_OPTIONS), { error: "Vælg hvor du helst vil træne" }),
  equipment: z.array(z.enum(values(EQUIPMENT_OPTIONS))).default([]),
  equipment_other: optionalText(500),
});

export const timeSchema = z.object({
  days_per_week: z.coerce.number({ error: "Vælg antal dage" }).int().min(1, "Vælg antal dage").max(7, "Højst 7 dage"),
  minutes_per_session: z.enum(values(MINUTES_OPTIONS), { error: "Vælg hvor lang tid du har" }),
  session_length_preference: z.enum(values(SESSION_LENGTH_OPTIONS), { error: "Vælg en mulighed" }),
  preferred_days: z.array(z.enum(values(WEEKDAY_OPTIONS))).default([]),
});

export const preferencesSchema = z.object({
  current_activity: optionalText(1000),
  preferred_exercises: optionalText(1000),
  disliked_activities: optionalText(1000),
  previous_experience: optionalText(1000),
});

/** Step F. `health_info` and `health_consent` go to their own columns, not `answers`. */
export const healthSchema = z
  .object({
    has_limitations: z.enum(values(LIMITATION_OPTIONS), { error: "Vælg en mulighed" }),
    health_info: optionalText(4000),
    health_consent: z.boolean().default(false),
  })
  .refine((v) => !(v.health_info && v.health_info.trim().length > 0) || v.health_consent, {
    message: "Du skal give samtykke, før vi kan gemme oplysninger om skader eller begrænsninger",
    path: ["health_consent"],
  });

export const nutritionInterestSchema = z.object({
  nutrition_interest: z.enum(values(NUTRITION_INTEREST_OPTIONS), { error: "Vælg en mulighed" }),
});

/** Extra questionnaire shown only to members who bought (or were granted) the nutrition plan. */
export const nutritionAnswersSchema = z.object({
  meals_per_day: z.enum(values(MEALS_OPTIONS), { error: "Vælg antal måltider" }),
  diet: z.array(z.enum(values(DIET_OPTIONS))).min(1, "Vælg mindst én mulighed"),
  diet_other: optionalText(300),
  foods_avoided: optionalText(1000),
  cooking_time: z.enum(values(COOKING_OPTIONS), { error: "Vælg en mulighed" }),
  typical_day: optionalText(1500),
  nutrition_goal: optionalText(1000),
});

/** Everything stored in onboarding_submissions.answers. */
export const onboardingAnswersSchema = basicSchema
  .extend(goalsSchema.shape)
  .extend(environmentSchema.shape)
  .extend(timeSchema.shape)
  .extend(preferencesSchema.shape)
  .extend({ has_limitations: z.enum(values(LIMITATION_OPTIONS)) })
  .extend(nutritionInterestSchema.shape);

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;
export type NutritionAnswers = z.infer<typeof nutritionAnswersSchema>;

export const ONBOARDING_STEPS = [
  { key: "basic", title: "Om dig" },
  { key: "goals", title: "Dine mål" },
  { key: "environment", title: "Hvor du træner" },
  { key: "time", title: "Din tid" },
  { key: "preferences", title: "Erfaring og ønsker" },
  { key: "health", title: "Skader og hensyn" },
  { key: "nutrition", title: "Kost" },
  { key: "review", title: "Gennemse og send" },
] as const;

// ---- Readable answers (admin view and member review) ------------------------

function label(options: Options, value: unknown) {
  return options.find((o) => o.value === value)?.label ?? (value == null || value === "" ? "" : String(value));
}
function labels(options: Options, value: unknown) {
  return Array.isArray(value) ? value.map((v) => label(options, v)).filter(Boolean).join(", ") : "";
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

export type AnswerSection = { title: string; items: { label: string; value: string }[] };

/** Turns stored answers into labelled sections. Missing answers are shown as "Ikke besvaret". */
export function describeAnswers(
  answers: Record<string, unknown> | null | undefined,
  extra?: { healthInfo?: string | null; healthConsent?: boolean; nutritionAnswers?: Record<string, unknown> | null },
): AnswerSection[] {
  const a = answers ?? {};
  const v = (s: string) => (s ? s : "Ikke besvaret");
  const sections: AnswerSection[] = [
    {
      title: "Om dig",
      items: [
        { label: "Navn", value: v(text(a.full_name)) },
        { label: "Alder", value: v(text(a.age)) },
        { label: "Træningserfaring", value: v(label(EXPERIENCE_OPTIONS, a.training_experience)) },
        { label: "Foretrukken kontakt", value: v(label(CONTACT_OPTIONS, a.contact_preference)) },
        { label: "Telefon", value: v(text(a.phone)) },
      ],
    },
    {
      title: "Mål",
      items: [
        { label: "Mål", value: v(labels(GOAL_OPTIONS, a.goals)) },
        { label: "Andet mål", value: v(text(a.goals_other)) },
        { label: "Personligt mål", value: v(text(a.personal_goal)) },
      ],
    },
    {
      title: "Træningssted og udstyr",
      items: [
        { label: "Foretrukket træningssted", value: v(label(ENVIRONMENT_OPTIONS, a.environment)) },
        { label: "Udstyr", value: v(labels(EQUIPMENT_OPTIONS, a.equipment)) },
        { label: "Andet udstyr", value: v(text(a.equipment_other)) },
      ],
    },
    {
      title: "Tid",
      items: [
        { label: "Dage om ugen", value: v(text(a.days_per_week)) },
        { label: "Tid pr. træning", value: v(label(MINUTES_OPTIONS, a.minutes_per_session)) },
        { label: "Længde på træningspas", value: v(label(SESSION_LENGTH_OPTIONS, a.session_length_preference)) },
        { label: "Foretrukne dage", value: v(labels(WEEKDAY_OPTIONS, a.preferred_days)) },
      ],
    },
    {
      title: "Erfaring og ønsker",
      items: [
        { label: "Nuværende aktivitet", value: v(text(a.current_activity)) },
        { label: "Øvelser du kan lide", value: v(text(a.preferred_exercises)) },
        { label: "Aktiviteter du ikke bryder dig om", value: v(text(a.disliked_activities)) },
        { label: "Tidligere træning", value: v(text(a.previous_experience)) },
      ],
    },
    {
      title: "Skader og hensyn",
      items: [
        { label: "Noget Christian skal tage hensyn til?", value: v(label(LIMITATION_OPTIONS, a.has_limitations)) },
        ...(extra
          ? [
              { label: "Samtykke til helbredsoplysninger", value: extra.healthConsent ? "Givet" : "Ikke givet" },
              { label: "Beskrivelse", value: v(text(extra.healthInfo)) },
            ]
          : []),
      ],
    },
    {
      title: "Kost",
      items: [{ label: "Interesse for kostplan", value: v(label(NUTRITION_INTEREST_OPTIONS, a.nutrition_interest)) }],
    },
  ];

  const n = extra?.nutritionAnswers;
  if (n && Object.keys(n).length > 0) {
    sections.push({
      title: "Kostplan – spørgeskema",
      items: [
        { label: "Måltider om dagen", value: v(label(MEALS_OPTIONS, n.meals_per_day)) },
        { label: "Kost", value: v(labels(DIET_OPTIONS, n.diet)) },
        { label: "Andet om kost", value: v(text(n.diet_other)) },
        { label: "Fødevarer du undgår", value: v(text(n.foods_avoided)) },
        { label: "Tid til madlavning", value: v(label(COOKING_OPTIONS, n.cooking_time)) },
        { label: "En typisk dag", value: v(text(n.typical_day)) },
        { label: "Mål med kosten", value: v(text(n.nutrition_goal)) },
      ],
    });
  }
  return sections;
}
