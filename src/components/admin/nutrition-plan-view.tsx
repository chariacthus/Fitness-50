import { formatDate } from "@/lib/format";
import { groupMeals } from "@/lib/training/display";
import { Alert } from "@/components/ui/alert";
import { SectionTitle } from "@/components/ui/layout";

// Read-only nutrition plan, presented the way the member sees it on
// /min-traening/kostplan. Used by the admin preview and the published view.

export type NutritionPlanContent = {
  title: string;
  intro: string | null;
  meal_structure: string | null;
  general_guidance: string | null;
  personal_notes: string | null;
  updated_at: string;
};

export type NutritionMealContent = { id: string; meal_type: string; title: string; description: string | null; position: number };

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

export function NutritionPlanView({
  plan,
  meals,
  coachName,
}: {
  plan: NutritionPlanContent;
  meals: NutritionMealContent[];
  coachName: string;
}) {
  const groups = groupMeals(meals);
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{plan.title}</h2>
        <p className="text-ink-soft">Senest opdateret {formatDate(plan.updated_at)}</p>
      </div>
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
      ) : (
        <p className="text-ink-soft">Der er ingen måltider i kostplanen endnu.</p>
      )}

      <TextBlock title="Generelle råd" text={plan.general_guidance} />
      {plan.personal_notes?.trim() ? (
        <section className="rounded-md border-l-4 border-brand bg-brand-soft px-4 py-3">
          <h2 className="text-xl font-semibold">Personlige noter fra {coachName}</h2>
          <p className="mt-1 max-w-prose whitespace-pre-line">{plan.personal_notes.trim()}</p>
        </section>
      ) : null}

      <Alert tone="info" title="Vigtigt at vide">
        {DISCLAIMER}
      </Alert>
    </div>
  );
}
