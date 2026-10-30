import { describe, expect, it } from "vitest";
import { describeAnswers, onboardingAnswersSchema } from "@/lib/onboarding/schema";
import {
  NUTRITION_FIELDS,
  NUTRITION_STEP,
  REVIEW_STEP,
  STEP_COUNT,
  STEP_FIELDS,
  afterSave,
  firstIncompleteStep,
  mergeAnswers,
  parseIntent,
  parseStep,
  readFields,
  resumeStep,
  sectionStep,
  stepDefaults,
  stepKey,
  stepTitle,
  validateNutritionAnswers,
  validateStep,
} from "@/components/onboarding/steps";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const completeAnswers = {
  full_name: "Jens Hansen",
  age: 58,
  training_experience: "lidt",
  contact_preference: "beskeder",
  goals: ["styrke", "energi"],
  environment: "hjemme",
  equipment: ["haandvaegte"],
  days_per_week: 3,
  minutes_per_session: "30",
  session_length_preference: "ingen",
  preferred_days: ["mandag", "torsdag"],
  has_limitations: "nej",
  nutrition_interest: "maaske",
};

describe("step navigation", () => {
  it("has eight steps, the last being the review", () => {
    expect(STEP_COUNT).toBe(8);
    expect(REVIEW_STEP).toBe(8);
    expect(NUTRITION_STEP).toBe(7);
    expect(stepKey(3)).toBe("environment");
    expect(stepTitle(3)).toBe("Hvor du træner");
    expect(stepKey(8)).toBe("review");
  });

  it("parses ?trin= and falls back for anything invalid", () => {
    expect(parseStep("3")).toBe(3);
    expect(parseStep(["5", "2"])).toBe(5);
    expect(parseStep("0", 4)).toBe(4);
    expect(parseStep("9", 4)).toBe(4);
    expect(parseStep("2abc", 4)).toBe(4);
    expect(parseStep(undefined, 6)).toBe(6);
    expect(parseStep(undefined, 42)).toBe(8);
  });

  it("resumes at the stored step (0 = not started)", () => {
    expect(resumeStep(0)).toBe(1);
    expect(resumeStep(null)).toBe(1);
    expect(resumeStep(5)).toBe(5);
    expect(resumeStep(20)).toBe(8);
  });

  it("decides where to go after saving", () => {
    expect(afterSave(3, "next")).toEqual({ currentStep: 4, redirectTo: "/onboarding?trin=4&gemt=1" });
    expect(afterSave(7, "next")).toEqual({ currentStep: 8, redirectTo: "/onboarding?trin=8&gemt=1" });
    expect(afterSave(3, "back")).toEqual({ currentStep: 2, redirectTo: "/onboarding?trin=2" });
    expect(afterSave(1, "back")).toEqual({ currentStep: 1, redirectTo: "/onboarding?trin=1" });
    expect(afterSave(4, "later")).toEqual({ currentStep: 4, redirectTo: "/hjem?onboarding=gemt" });
    expect(parseIntent("back")).toBe("back");
    expect(parseIntent("hack")).toBe("next");
    expect(parseIntent(null)).toBe("next");
  });
});

describe("readFields", () => {
  it("reads text, lists and flags; empty text becomes undefined", () => {
    const fd = form([
      ["full_name", "  Jens Hansen "],
      ["age", ""],
      ["goals", "styrke"],
      ["goals", "energi"],
      ["health_consent", "on"],
    ]);
    expect(readFields(fd, STEP_FIELDS.basic)).toEqual({
      full_name: "  Jens Hansen ",
      age: undefined,
      training_experience: undefined,
      contact_preference: undefined,
      phone: undefined,
    });
    expect(readFields(fd, STEP_FIELDS.goals).goals).toEqual(["styrke", "energi"]);
    expect(readFields(fd, STEP_FIELDS.health).health_consent).toBe(true);
    expect(readFields(new FormData(), STEP_FIELDS.health).health_consent).toBe(false);
    expect(readFields(new FormData(), STEP_FIELDS.goals).goals).toEqual([]);
  });
});

describe("validateStep", () => {
  it("strict mode reports missing answers in Danish", () => {
    const result = validateStep("basic", { full_name: "Jens Hansen" }, "strict");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.training_experience).toBe("Vælg din træningserfaring");
      expect(result.fieldErrors.contact_preference).toBe("Vælg hvordan Christian bedst kontakter dig");
      expect(result.fieldErrors.full_name).toBeUndefined();
    }
  });

  it("strict mode trims and coerces valid answers", () => {
    const result = validateStep(
      "basic",
      { full_name: "  Jens Hansen ", age: "58", training_experience: "lidt", contact_preference: "telefon", phone: "12 34 56 78" },
      "strict",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ full_name: "Jens Hansen", age: 58, phone: "12 34 56 78" });
  });

  it("rejects a phone number the profile page would refuse", () => {
    const base = { full_name: "Jens Hansen", training_experience: "lidt", contact_preference: "telefon" };
    const strict = validateStep("basic", { ...base, phone: "1234" }, "strict");
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.fieldErrors.phone).toBe("Skriv et telefonnummer med cifre, fx 12 34 56 78.");
    const lenient = validateStep("basic", { ...base, phone: "ring efter kl. 17" }, "lenient");
    expect(lenient.ok).toBe(true);
    if (lenient.ok) {
      expect(lenient.skipped).toContain("phone");
      expect(lenient.data).not.toHaveProperty("phone");
    }
  });

  it("rejects an age that is not plausible", () => {
    const result = validateStep("basic", { full_name: "Jens", age: "12", training_experience: "lidt", contact_preference: "email" }, "strict");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.age).toBe("Alderen skal være mindst 18");
  });

  it("lenient mode keeps the valid fields and skips the rest", () => {
    const result = validateStep("basic", { full_name: "Jens Hansen", training_experience: "ukendt" }, "lenient");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.full_name).toBe("Jens Hansen");
      expect(result.skipped).toContain("training_experience");
      expect(result.skipped).toContain("contact_preference");
      expect(result.skipped).not.toContain("phone");
    }
  });

  it("rejects unknown option values", () => {
    const result = validateStep("goals", { goals: ["styrke", "flyve"] }, "strict");
    expect(result.ok).toBe(false);
  });

  it("requires consent before health information can be saved – in every mode", () => {
    const input = { has_limitations: "ja", health_info: "Ondt i knæet", health_consent: false };
    for (const mode of ["strict", "lenient"] as const) {
      const result = validateStep("health", input, mode);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors.health_consent).toMatch(/samtykke/);
    }
    expect(validateStep("health", { ...input, health_consent: true }, "strict").ok).toBe(true);
    expect(validateStep("health", { has_limitations: "nej", health_consent: false }, "strict").ok).toBe(true);
  });

  it("requires consent for the answer 'ja' – in every mode, on the consent field", () => {
    const input = { has_limitations: "ja", health_consent: false };
    for (const mode of ["strict", "lenient"] as const) {
      const result = validateStep("health", input, mode);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.fieldErrors.health_consent).toMatch(/samtykke/);
        expect(result.fieldErrors.health_consent).toMatch(/Det vil jeg helst ikke skrive her/);
      }
    }
    expect(validateStep("health", { ...input, health_consent: true }, "strict").ok).toBe(true);
    expect(validateStep("health", { has_limitations: "vil_ikke_oplyse", health_consent: false }, "lenient").ok).toBe(true);
  });

  it("shows the consent error together with other errors", () => {
    const result = validateStep("health", { health_info: "Ondt i ryggen", health_consent: false }, "strict");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.has_limitations).toBeDefined();
      expect(result.fieldErrors.health_consent).toBeDefined();
    }
  });

  it("validates the nutrition questionnaire", () => {
    expect(validateNutritionAnswers({ meals_per_day: "3", diet: ["alt"], cooking_time: "middel" }, "strict").ok).toBe(true);
    const missing = validateNutritionAnswers({ meals_per_day: "3", diet: [] }, "strict");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors.diet).toBe("Vælg mindst én mulighed");
  });
});

describe("mergeAnswers", () => {
  it("merges a step into the existing answers", () => {
    const merged = mergeAnswers({ full_name: "Jens" }, STEP_FIELDS.goals, { goals: ["styrke"], personal_goal: "Stærkere ryg" });
    expect(merged).toEqual({ full_name: "Jens", goals: ["styrke"], personal_goal: "Stærkere ryg" });
  });

  it("removes answers that were cleared and keeps skipped ones", () => {
    const existing = { goals: ["styrke"], goals_other: "Golf", personal_goal: "Gammelt mål" };
    const merged = mergeAnswers(existing, STEP_FIELDS.goals, { goals_other: "", personal_goal: undefined }, ["goals"]);
    expect(merged).toEqual({ goals: ["styrke"] });
  });

  it("never stores health information in answers", () => {
    const existing = { has_limitations: "nej", health_info: "skulle ikke være her" };
    const merged = mergeAnswers(existing, STEP_FIELDS.health, {
      has_limitations: "ja",
      health_info: "Ondt i knæet",
      health_consent: true,
    });
    expect(merged).toEqual({ has_limitations: "ja" });
    expect(merged).not.toHaveProperty("health_info");
    expect(merged).not.toHaveProperty("health_consent");
  });

  it("treats non-object stored values as empty", () => {
    expect(mergeAnswers(null, STEP_FIELDS.nutrition, { nutrition_interest: "ja" })).toEqual({ nutrition_interest: "ja" });
    expect(mergeAnswers(["x"], STEP_FIELDS.nutrition, { nutrition_interest: "ja" })).toEqual({ nutrition_interest: "ja" });
  });

  it("merges nutrition answers in the same way", () => {
    const merged = mergeAnswers({ meals_per_day: "2", diet: ["alt"] }, NUTRITION_FIELDS, { meals_per_day: "4", diet: ["vegetar"] }, []);
    expect(merged).toEqual({ meals_per_day: "4", diet: ["vegetar"] });
  });
});

describe("firstIncompleteStep", () => {
  it("returns 1 for an empty questionnaire", () => {
    expect(firstIncompleteStep({})).toBe(1);
    expect(firstIncompleteStep(null)).toBe(1);
  });

  it("returns null when every required answer is there – and the full schema agrees", () => {
    expect(firstIncompleteStep(completeAnswers)).toBeNull();
    expect(onboardingAnswersSchema.safeParse(completeAnswers).success).toBe(true);
  });

  it("points at the first step with a missing answer", () => {
    const { has_limitations: _h, ...noHealth } = completeAnswers;
    void _h;
    expect(firstIncompleteStep(noHealth)).toBe(6);
    const { goals: _g, ...noGoals } = completeAnswers;
    void _g;
    expect(firstIncompleteStep({ ...noGoals, goals: [] })).toBe(2);
    const { nutrition_interest: _n, ...noNutrition } = completeAnswers;
    void _n;
    expect(firstIncompleteStep(noNutrition)).toBe(7);
  });
});

describe("review sections", () => {
  it("links every section of describeAnswers to its step", () => {
    const sections = describeAnswers(completeAnswers, {
      healthInfo: null,
      healthConsent: false,
      nutritionAnswers: { meals_per_day: "3" },
    });
    expect(sections.map((s, i) => [s.title, sectionStep(i)])).toEqual([
      ["Om dig", 1],
      ["Mål", 2],
      ["Træningssted og udstyr", 3],
      ["Tid", 4],
      ["Erfaring og ønsker", 5],
      ["Skader og hensyn", 6],
      ["Kost", 7],
      ["Kostplan – spørgeskema", 7],
    ]);
  });
});

describe("stepDefaults", () => {
  it("prefills step A from the profile when nothing is saved yet", () => {
    const values = stepDefaults("basic", {
      answers: {},
      profile: { fullName: "Jens Hansen", phone: "12345678", contactPreference: "telefon" },
    });
    expect(values).toMatchObject({ full_name: "Jens Hansen", phone: "12345678", contact_preference: "telefon" });
  });

  it("prefers saved answers over the profile and turns numbers into form values", () => {
    const values = stepDefaults("basic", {
      answers: { full_name: "J. Hansen", age: 61, contact_preference: "email" },
      profile: { fullName: "Jens Hansen", phone: null, contactPreference: "telefon" },
    });
    expect(values).toMatchObject({ full_name: "J. Hansen", age: "61", contact_preference: "email" });
    expect(stepDefaults("time", { answers: { days_per_week: 3 } }).days_per_week).toBe("3");
  });

  it("reads health information from its own columns", () => {
    const values = stepDefaults("health", {
      answers: { has_limitations: "ja", health_info: "ignored" },
      healthInfo: "Ondt i knæet",
      healthConsent: true,
    });
    expect(values).toEqual({ has_limitations: "ja", health_info: "Ondt i knæet", health_consent: true });
  });

  it("includes the nutrition questionnaire on the nutrition step", () => {
    const values = stepDefaults("nutrition", {
      answers: { nutrition_interest: "ja" },
      nutritionAnswers: { meals_per_day: "3", diet: ["alt"] },
    });
    expect(values).toMatchObject({ nutrition_interest: "ja", meals_per_day: "3", diet: ["alt"] });
  });
});
