import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  ONBOARDING_STEPS,
  basicSchema,
  describeAnswers,
  environmentSchema,
  goalsSchema,
  healthSchema,
  nutritionAnswersSchema,
  nutritionInterestSchema,
  onboardingAnswersSchema,
  preferencesSchema,
  timeSchema,
} from "@/lib/onboarding/schema";

/** The Danish error message zod reports for a field (first issue). */
function errorFor(schema: z.ZodType, input: unknown, field: string) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  const issue = result.error?.issues.find((i) => i.path[0] === field);
  expect(issue, `ingen fejl for ${field}`).toBeDefined();
  return issue?.message;
}

// Note: the form reads empty inputs as `undefined` (readFields in
// src/components/onboarding/steps.ts), so optional fields are tested that way.
const validBasic = { full_name: "Jens Hansen", age: "62", training_experience: "lidt", contact_preference: "email", phone: "" };
const validGoals = { goals: ["styrke", "energi"], goals_other: "", personal_goal: "Kunne bære barnebarnet" };
const validEnvironment = { environment: "hjemme", equipment: ["haandvaegte", "elastikker"] };
const validTime = { days_per_week: "3", minutes_per_session: "30", session_length_preference: "kortere", preferred_days: ["mandag", "torsdag"] };
const validPreferences = { current_activity: "Går ture", preferred_exercises: undefined, disliked_activities: "Løb", previous_experience: undefined };
const validHealth = { has_limitations: "nej", health_info: undefined, health_consent: false };
const validNutritionInterest = { nutrition_interest: "maaske" };

describe("step schemas accept valid input", () => {
  it("basic: coerces the age to a number and allows no age", () => {
    const parsed = basicSchema.parse(validBasic);
    expect(parsed.age).toBe(62);
    expect(parsed.full_name).toBe("Jens Hansen");
    expect(basicSchema.parse({ ...validBasic, age: undefined }).age).toBeUndefined();
  });

  it("goals, environment, time, preferences, health and nutrition interest", () => {
    expect(goalsSchema.parse(validGoals).goals).toEqual(["styrke", "energi"]);
    expect(environmentSchema.parse({ environment: "fitnesscenter" }).equipment).toEqual([]);
    expect(environmentSchema.parse(validEnvironment).equipment).toEqual(["haandvaegte", "elastikker"]);
    expect(timeSchema.parse(validTime).days_per_week).toBe(3);
    expect(timeSchema.parse({ ...validTime, preferred_days: undefined }).preferred_days).toEqual([]);
    expect(preferencesSchema.safeParse(validPreferences).success).toBe(true);
    expect(healthSchema.safeParse(validHealth).success).toBe(true);
    expect(nutritionInterestSchema.safeParse(validNutritionInterest).success).toBe(true);
  });

  it("trims text answers", () => {
    expect(basicSchema.parse({ ...validBasic, full_name: "  Jens Hansen  " }).full_name).toBe("Jens Hansen");
  });

  it("the full answers object passes and never carries health information", () => {
    const parsed = onboardingAnswersSchema.parse({
      ...validBasic,
      ...validGoals,
      ...validEnvironment,
      ...validTime,
      ...validPreferences,
      has_limitations: "ja",
      ...validNutritionInterest,
      health_info: "Dårligt knæ",
      health_consent: true,
    });
    expect(parsed).not.toHaveProperty("health_info");
    expect(parsed).not.toHaveProperty("health_consent");
    expect(parsed.has_limitations).toBe("ja");
  });

  it("nutrition questionnaire", () => {
    const parsed = nutritionAnswersSchema.parse({ meals_per_day: "3", diet: ["vegetar"], cooking_time: "middel" });
    expect(parsed.diet).toEqual(["vegetar"]);
  });
});

describe("step schemas reject invalid input with Danish messages", () => {
  it("basic", () => {
    expect(errorFor(basicSchema, { ...validBasic, full_name: "J" }, "full_name")).toBe("Skriv dit fulde navn");
    expect(errorFor(basicSchema, { ...validBasic, full_name: "x".repeat(121) }, "full_name")).toBe("Navnet er for langt");
    expect(errorFor(basicSchema, { ...validBasic, age: "tres" }, "age")).toBe("Skriv din alder som et tal");
    expect(errorFor(basicSchema, { ...validBasic, age: "62.5" }, "age")).toBe("Skriv din alder som et helt tal");
    expect(errorFor(basicSchema, { ...validBasic, age: "15" }, "age")).toBe("Alderen skal være mindst 18");
    expect(errorFor(basicSchema, { ...validBasic, age: "130" }, "age")).toBe("Tjek venligst alderen");
    expect(errorFor(basicSchema, { ...validBasic, training_experience: undefined }, "training_experience")).toBe("Vælg din træningserfaring");
    expect(errorFor(basicSchema, { ...validBasic, contact_preference: "brevdue" }, "contact_preference")).toBe(
      "Vælg hvordan Christian bedst kontakter dig",
    );
    expect(errorFor(basicSchema, { ...validBasic, phone: "1".repeat(41) }, "phone")).toBe("Højst 40 tegn");
  });

  it("goals", () => {
    expect(errorFor(goalsSchema, { ...validGoals, goals: [] }, "goals")).toBe("Vælg mindst ét mål");
    expect(goalsSchema.safeParse({ ...validGoals, goals: ["flyve"] }).success).toBe(false);
    expect(errorFor(goalsSchema, { ...validGoals, personal_goal: "x".repeat(1001) }, "personal_goal")).toBe("Højst 1000 tegn");
  });

  it("environment", () => {
    expect(errorFor(environmentSchema, { environment: undefined }, "environment")).toBe("Vælg hvor du helst vil træne");
  });

  it("time", () => {
    expect(errorFor(timeSchema, { ...validTime, days_per_week: "0" }, "days_per_week")).toBe("Vælg antal dage");
    expect(errorFor(timeSchema, { ...validTime, days_per_week: "8" }, "days_per_week")).toBe("Højst 7 dage");
    expect(errorFor(timeSchema, { ...validTime, minutes_per_session: undefined }, "minutes_per_session")).toBe("Vælg hvor lang tid du har");
    expect(errorFor(timeSchema, { ...validTime, session_length_preference: "x" }, "session_length_preference")).toBe("Vælg en mulighed");
  });

  it("health: an answer is required", () => {
    expect(errorFor(healthSchema, { ...validHealth, has_limitations: undefined }, "has_limitations")).toBe("Vælg en mulighed");
  });

  it("nutrition", () => {
    expect(errorFor(nutritionInterestSchema, {}, "nutrition_interest")).toBe("Vælg en mulighed");
    expect(errorFor(nutritionAnswersSchema, { meals_per_day: "3", diet: [], cooking_time: "lidt" }, "diet")).toBe("Vælg mindst én mulighed");
    expect(errorFor(nutritionAnswersSchema, { diet: ["alt"], cooking_time: "lidt" }, "meals_per_day")).toBe("Vælg antal måltider");
  });
});

describe("health consent", () => {
  const consentMessage = "Du skal give samtykke, før vi kan gemme oplysninger om skader eller begrænsninger";

  it("rejects a description of injuries without consent, on the consent field", () => {
    expect(errorFor(healthSchema, { has_limitations: "ja", health_info: "Dårligt knæ", health_consent: false }, "health_consent")).toBe(
      consentMessage,
    );
    expect(errorFor(healthSchema, { has_limitations: "ja", health_info: "Dårligt knæ" }, "health_consent")).toBe(consentMessage);
  });

  it("accepts the description with consent", () => {
    const parsed = healthSchema.parse({ has_limitations: "ja", health_info: " Dårligt knæ ", health_consent: true });
    expect(parsed).toEqual({ has_limitations: "ja", health_info: "Dårligt knæ", health_consent: true });
  });

  it("does not require consent when nothing (or only spaces) is written", () => {
    expect(healthSchema.safeParse({ has_limitations: "vil_ikke_oplyse", health_info: "", health_consent: false }).success).toBe(true);
    expect(healthSchema.safeParse({ has_limitations: "nej", health_info: "   " }).success).toBe(true);
  });

  it("limits the description to 4000 characters", () => {
    expect(errorFor(healthSchema, { has_limitations: "ja", health_info: "x".repeat(4001), health_consent: true }, "health_info")).toBe(
      "Højst 4000 tegn",
    );
  });
});

describe("ONBOARDING_STEPS", () => {
  it("has the eight steps in order with Danish titles", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual(["basic", "goals", "environment", "time", "preferences", "health", "nutrition", "review"]);
    expect(ONBOARDING_STEPS[0].title).toBe("Om dig");
    expect(ONBOARDING_STEPS[7].title).toBe("Gennemse og send");
  });
});

describe("describeAnswers", () => {
  const item = (sections: ReturnType<typeof describeAnswers>, title: string, label: string) =>
    sections.find((s) => s.title === title)?.items.find((i) => i.label === label)?.value;

  it("shows 'Ikke besvaret' for every missing answer", () => {
    const sections = describeAnswers(null);
    expect(sections.map((s) => s.title)).toEqual(["Om dig", "Mål", "Træningssted og udstyr", "Tid", "Erfaring og ønsker", "Skader og hensyn", "Kost"]);
    const values = sections.flatMap((s) => s.items.map((i) => i.value));
    expect(new Set(values)).toEqual(new Set(["Ikke besvaret"]));
  });

  it("turns stored values into readable Danish labels", () => {
    const sections = describeAnswers({
      full_name: "Jens Hansen",
      age: 62,
      training_experience: "lidt",
      contact_preference: "telefon",
      goals: ["styrke", "energi"],
      environment: "kombination",
      equipment: ["intet"],
      days_per_week: 3,
      minutes_per_session: "60+",
      preferred_days: ["loerdag", "soendag"],
      has_limitations: "ja",
      nutrition_interest: "ja",
    });
    expect(item(sections, "Om dig", "Alder")).toBe("62");
    expect(item(sections, "Om dig", "Træningserfaring")).toBe("Lidt – jeg har trænet en gang imellem");
    expect(item(sections, "Om dig", "Foretrukken kontakt")).toBe("Telefon");
    expect(item(sections, "Mål", "Mål")).toBe("Blive stærkere, Få mere energi");
    expect(item(sections, "Træningssted og udstyr", "Foretrukket træningssted")).toBe("En kombination af flere muligheder");
    expect(item(sections, "Tid", "Dage om ugen")).toBe("3");
    expect(item(sections, "Tid", "Tid pr. træning")).toBe("Mere end 1 time");
    expect(item(sections, "Tid", "Foretrukne dage")).toBe("Lørdag, Søndag");
    expect(item(sections, "Skader og hensyn", "Noget Christian skal tage hensyn til?")).toBe("Ja, der er noget Christian bør vide");
    expect(item(sections, "Kost", "Interesse for kostplan")).toBe("Ja, det er jeg interesseret i");
  });

  it("shows unknown stored values as they are instead of hiding them", () => {
    expect(item(describeAnswers({ environment: "bjerget" }), "Træningssted og udstyr", "Foretrukket træningssted")).toBe("bjerget");
  });

  it("only includes health details when they are passed in explicitly", () => {
    const withoutExtra = describeAnswers({ has_limitations: "ja" });
    expect(withoutExtra.find((s) => s.title === "Skader og hensyn")?.items).toHaveLength(1);

    const withConsent = describeAnswers({ has_limitations: "ja" }, { healthInfo: "Dårligt knæ", healthConsent: true });
    expect(item(withConsent, "Skader og hensyn", "Samtykke til helbredsoplysninger")).toBe("Givet");
    expect(item(withConsent, "Skader og hensyn", "Beskrivelse")).toBe("Dårligt knæ");

    const withoutConsent = describeAnswers({ has_limitations: "nej" }, { healthInfo: null, healthConsent: false });
    expect(item(withoutConsent, "Skader og hensyn", "Samtykke til helbredsoplysninger")).toBe("Ikke givet");
    expect(item(withoutConsent, "Skader og hensyn", "Beskrivelse")).toBe("Ikke besvaret");
  });

  it("adds the nutrition questionnaire section only when it has answers", () => {
    expect(describeAnswers({}, { nutritionAnswers: {} }).map((s) => s.title)).not.toContain("Kostplan – spørgeskema");
    const sections = describeAnswers({}, { nutritionAnswers: { meals_per_day: "5+", diet: ["vegetar", "uden_gluten"], cooking_time: "meget" } });
    expect(item(sections, "Kostplan – spørgeskema", "Måltider om dagen")).toBe("5 eller flere");
    expect(item(sections, "Kostplan – spørgeskema", "Kost")).toBe("Vegetar, Uden gluten");
    expect(item(sections, "Kostplan – spørgeskema", "Tid til madlavning")).toBe("Jeg kan godt lide at lave mad");
    expect(item(sections, "Kostplan – spørgeskema", "Fødevarer du undgår")).toBe("Ikke besvaret");
  });
});
