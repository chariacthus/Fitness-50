import type { Metadata } from "next";
import { requireEntitledViewer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { groupMeals } from "@/lib/training/display";
import { NUTRITION_STEP } from "@/components/onboarding/steps";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Min kostplan" };

const DISCLAIMER =
  "Kostplanen er generel vejledning og ikke medicinsk kostbehandling. Har du en sygdom eller særlige behov, så tal med din læge eller en autoriseret klinisk diætist.";

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text?.trim()) return null;
  return (
    <section className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      <p className="max-w-prose whitespace-pre-line">{text.trim()}</p>
    </section>
  );
}

export default async function NutritionPlanPage() {
  const viewer = await requireEntitledViewer("/min-traening/kostplan");
  const supabase = await createClient();
  const [settings, addonRes] = await Promise.all([getSiteSettings(), supabase.rpc("has_addon", { p_slug: "kostplan" })]);
  const coach = settings.coach_name;
  const back = { href: "/min-traening", label: "Tilbage til Min træning" };

  if (addonRes.error) {
    return (
      <>
        <PageHeader title="Min kostplan" back={back} />
        <Alert tone="danger">Vi kunne ikke hente oplysninger om din kostplan lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }

  if (addonRes.data !== true) {
    return (
      <>
        <PageHeader title="Personlig kostplan" back={back} />
        <EmptyState
          title="Du har ikke en personlig kostplan endnu"
          action={
            <ButtonLink href="/tilkoeb/kostplan" size="lg">
              Læs om den personlige kostplan
            </ButtonLink>
          }
        >
          Kostplanen kan købes som tilkøb til dit medlemskab. {coach} laver den ud fra dine svar om måltider, vaner og mål.
        </EmptyState>
      </>
    );
  }

  const [planRes, onboardingRes] = await Promise.all([
    supabase
      .from("nutrition_plans")
      .select("id, title, intro, general_guidance, meal_structure, personal_notes, updated_at, nutrition_meals(id, meal_type, title, description, position)")
      .eq("member_id", viewer.userId)
      .eq("status", "published")
      .maybeSingle(),
    supabase.from("onboarding_submissions").select("nutrition_answers").eq("user_id", viewer.userId).maybeSingle(),
  ]);

  if (planRes.error) {
    return (
      <>
        <PageHeader title="Min kostplan" back={back} />
        <Alert tone="danger">Vi kunne ikke hente din kostplan lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }

  const plan = planRes.data;
  if (!plan) {
    const answers = onboardingRes.data?.nutrition_answers;
    const missingAnswers = !answers || typeof answers !== "object" || Object.keys(answers).length === 0;
    return (
      <>
        <PageHeader title="Min kostplan" back={back} />
        <EmptyState
          title={`${coach} laver din kostplan`}
          action={
            missingAnswers ? (
              <ButtonLink href={`/onboarding?trin=${NUTRITION_STEP}`} size="lg">
                Besvar spørgsmålene om kost
              </ButtonLink>
            ) : undefined
          }
        >
          {missingAnswers
            ? `${coach} mangler dine svar om måltider og vaner, før han kan lave din kostplan.`
            : "Du får en notifikation, så snart din kostplan er klar."}
        </EmptyState>
      </>
    );
  }

  const groups = groupMeals(plan.nutrition_meals ?? []);

  return (
    <>
      <PageHeader title={plan.title} description={`Senest opdateret ${formatDate(plan.updated_at)}`} back={back} />
      <div className="space-y-10">
        {plan.intro?.trim() ? <p className="max-w-prose whitespace-pre-line text-lg">{plan.intro.trim()}</p> : null}
        <TextBlock title="Måltidsstruktur" text={plan.meal_structure} />

        {groups.length > 0 ? (
          <section aria-labelledby="meals-title" className="space-y-5">
            <SectionTitle id="meals-title">Måltider</SectionTitle>
            {groups.map((g) => (
              <div key={g.type} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
                <h3 className="text-xl font-semibold">{g.label}</h3>
                <ul className="mt-3 divide-y divide-line">
                  {g.meals.map((m) => (
                    <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="font-semibold">{m.title}</p>
                      {m.description?.trim() ? <p className="max-w-prose whitespace-pre-line">{m.description.trim()}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        <TextBlock title="Generelle råd" text={plan.general_guidance} />
        {plan.personal_notes?.trim() ? (
          <section className="rounded-md border-l-4 border-brand bg-brand-soft px-4 py-3">
            <h2 className="text-xl font-semibold">Personlige noter fra {coach}</h2>
            <p className="mt-1 max-w-prose whitespace-pre-line">{plan.personal_notes.trim()}</p>
          </section>
        ) : null}

        <Alert tone="info" title="Vigtigt at vide">
          {DISCLAIMER}
        </Alert>
      </div>
    </>
  );
}
