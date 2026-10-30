import type { Metadata } from "next";
import { requireEntitledViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { describeAnswers } from "@/lib/onboarding/schema";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { AnswersSummary } from "@/components/onboarding/answers-summary";
import { StepProgress } from "@/components/onboarding/step-progress";
import {
  NUTRITION_STEP,
  REVIEW_STEP,
  asRecord,
  parseStep,
  resumeStep,
  stepDefaults,
  stepKey,
  stepTitle,
  type FormStepKey,
  type StepKey,
} from "@/components/onboarding/steps";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { StepForm } from "./step-form";
import { ReopenOnboardingForm, SubmitOnboardingForm } from "./submit-form";

export const metadata: Metadata = { title: "Spørgeskema" };

const INTROS: Record<StepKey, (coach: string) => string> = {
  basic: (coach) => `Lidt om dig, så ${coach} ved, hvem han laver planen til.`,
  goals: () => "Hvad vil du gerne opnå med træningen?",
  environment: () => "Hvor vil du helst træne, og hvilket udstyr har du adgang til?",
  time: () => "Hvor meget tid har du til træning i en almindelig uge?",
  preferences: () => "Fortæl gerne lidt om, hvad du laver i dag, og hvad du kan lide. Alle felter er valgfrie.",
  health: (coach) => `Her kan du fortælle om skader eller andet, ${coach} skal tage hensyn til.`,
  nutrition: () => "Kosten betyder meget for, hvordan du har det. Fortæl, om du er interesseret i hjælp til den.",
  review: (coach) => `Tjek dine svar. Du kan rette alt, før du sender dem til ${coach}.`,
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireEntitledViewer("/onboarding");
  const sp = await searchParams;
  const supabase = await createClient();

  const [settings, submissionRes, privateRes, addonRes] = await Promise.all([
    getSiteSettings(),
    supabase
      .from("onboarding_submissions")
      .select("id, status, current_step, answers, health_info, health_consent, nutrition_answers, submitted_at, reviewed_at")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
    supabase.from("profile_private").select("phone, contact_preference").eq("user_id", viewer.userId).maybeSingle(),
    supabase.rpc("has_addon", { p_slug: "kostplan" }),
  ]);
  const coach = settings.coach_name;

  if (submissionRes.error) {
    return (
      <>
        <PageHeader title="Spørgeskema" />
        <Alert tone="danger">Vi kunne ikke hente dit spørgeskema lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }

  const row = submissionRes.data;
  const answers = asRecord(row?.answers);
  const nutritionAnswers = row?.nutrition_answers ? asRecord(row.nutrition_answers) : null;
  const sections = describeAnswers(answers, {
    healthInfo: row?.health_info,
    healthConsent: row?.health_consent ?? false,
    nutritionAnswers,
  });

  // ---- Sent: read-only summary + "Ret mine svar" ----------------------------
  if (row && (row.status === "submitted" || row.status === "reviewed")) {
    const justSent = sp.sendt === "1";
    const wantedStep = parseStep(sp.trin, REVIEW_STEP);
    return (
      <>
        <PageHeader title="Dit spørgeskema" description={`Her kan du se de svar, du har sendt til ${coach}.`} />
        <div className="space-y-8">
          {justSent ? (
            <Alert tone="success" title="Dine svar er sendt">
              Tak! {coach} har fået dine svar og laver din personlige plan. Du får en notifikation, når den er klar.
            </Alert>
          ) : null}
          {!justSent && sp.trin ? (
            <Alert tone="info">Du har allerede sendt dine svar. Vil du ændre noget, så tryk på »Ret mine svar«.</Alert>
          ) : null}

          <Panel className="space-y-4">
            <div className="space-y-1">
              {row.submitted_at ? (
                <p className="text-lg">
                  Sendt til {coach} <strong>{formatDateTime(row.submitted_at)}</strong>
                </p>
              ) : null}
              {row.status === "reviewed" && row.reviewed_at ? (
                <p className="text-lg">
                  {coach} har gennemgået dine svar <strong>{formatDateTime(row.reviewed_at)}</strong>
                </p>
              ) : null}
            </div>
            <p className="text-ink-soft">
              Vil du ændre noget? Dine ændringer sendes først til {coach}, når du trykker Send igen.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
              <ReopenOnboardingForm step={wantedStep} />
              <ButtonLink href="/hjem" variant="ghost" size="lg" className="underline">
                Gå til forsiden
              </ButtonLink>
            </div>
          </Panel>

          <section aria-labelledby="answers-title" className="space-y-4">
            <SectionTitle id="answers-title">Dine svar</SectionTitle>
            <AnswersSummary sections={sections} editable={false} />
          </section>
        </div>
      </>
    );
  }

  // ---- Draft: one step at a time ----------------------------------------------
  const step = parseStep(sp.trin, resumeStep(row?.current_step));
  const key = stepKey(step);
  const editingSent = Boolean(row?.submitted_at);

  return (
    <>
      <PageHeader
        title="Spørgeskema"
        description={`Dine svar hjælper ${coach} med at lave en træningsplan, der passer til dig. Dine svar gemmes for hvert trin.`}
      />
      <div className="space-y-8">
        <StepProgress step={step} />

        {editingSent ? (
          <Alert tone="warning" title="Du er ved at rette dine svar">
            Dine ændringer sendes først til {coach}, når du trykker Send igen.
          </Alert>
        ) : null}
        {sp.gemt === "1" && step > 1 ? (
          <Alert tone="success" title={null}>
            Trin {step - 1} – {stepTitle(step - 1)} er gemt.
          </Alert>
        ) : null}

        <section aria-labelledby="step-title" className="space-y-6">
          <div className="space-y-2">
            <h2 id="step-title" className="text-2xl font-semibold tracking-tight">
              {stepTitle(step)}
            </h2>
            <p className="max-w-prose text-lg text-ink-soft">{INTROS[key](coach)}</p>
          </div>

          {key === "review" ? (
            <div className="space-y-8">
              <AnswersSummary sections={sections} editable />
              <Panel className="space-y-4">
                <p className="text-lg">Når du sender dine svar, får {coach} besked og går i gang med din personlige plan.</p>
                <SubmitOnboardingForm coachName={coach} resubmit={editingSent} />
              </Panel>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ButtonLink href={`/onboarding?trin=${NUTRITION_STEP}`} variant="secondary" size="lg">
                  Tilbage
                </ButtonLink>
                <ButtonLink href="/hjem" variant="ghost" size="lg" className="underline">
                  Fortsæt senere
                </ButtonLink>
              </div>
              <p className="text-ink-soft">Dine svar er gemt, så du kan sende dem, når det passer dig.</p>
            </div>
          ) : (
            <StepForm
              key={step}
              step={step}
              stepKey={key as FormStepKey}
              defaults={stepDefaults(key as FormStepKey, {
                answers,
                healthInfo: row?.health_info,
                healthConsent: row?.health_consent,
                nutritionAnswers,
                profile: {
                  fullName: viewer.profile.full_name,
                  phone: privateRes.data?.phone,
                  contactPreference: privateRes.data?.contact_preference,
                },
              })}
              coachName={coach}
              businessName={settings.business_name}
              hasNutritionAddon={addonRes.data === true}
              hadHealthConsent={row?.health_consent === true}
            />
          )}
        </section>
      </div>
    </>
  );
}
