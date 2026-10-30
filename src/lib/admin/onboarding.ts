// Onboarding answers prepared for the admin views. Health information is kept
// apart from the ordinary answers and is only returned with consent.

import { describeAnswers, type AnswerSection } from "@/lib/onboarding/schema";

export type SubmissionForAdmin = {
  answers: unknown;
  health_info: string | null;
  health_consent: boolean;
  nutrition_answers: unknown;
};

export type AdminAnswers = {
  sections: AnswerSection[];
  /** Health information – only when the member has given consent. */
  sensitive: string | null;
  consentGiven: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function adminAnswers(submission: SubmissionForAdmin): AdminAnswers {
  const answers = asRecord(submission.answers);
  // describeAnswers() adds the health rows to "Skader og hensyn" whenever
  // `extra` is passed. The ordinary sections are therefore taken from a call
  // without `extra`, and only the sections it appends (the nutrition
  // questionnaire) are taken from the second call.
  const base = describeAnswers(answers);
  const withNutrition = describeAnswers(answers, { nutritionAnswers: asRecord(submission.nutrition_answers) });
  const sections = [...base, ...withNutrition.slice(base.length)];
  const info = submission.health_info?.trim() ?? "";
  return {
    sections,
    sensitive: submission.health_consent && info ? info : null,
    consentGiven: submission.health_consent,
  };
}
