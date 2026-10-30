import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatShortDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { MEAL_TYPES, MEAL_TYPE_LABELS, groupMeals } from "@/lib/training/display";
import { emailOutcomeText, parseEmailOutcomeCode } from "@/lib/admin/email-outcome";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { genitive, memberDisplayName } from "@/lib/admin/members";
import { ActionForm, FormSelect, FormTextarea, FormTextField } from "@/components/admin/action-form";
import { MemberLink } from "@/components/admin/member-link";
import { NutritionPlanView } from "@/components/admin/nutrition-plan-view";
import { PlanStatusBanner } from "@/components/admin/plan-status";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addMeal,
  archiveNutritionPlan,
  createNutritionVersion,
  deleteMeal,
  deleteNutritionDraft,
  moveMeal,
  publishNutritionPlan,
  updateMeal,
  updateNutritionDetails,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kostplan" };

const MEAL_OPTIONS = MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }));
const summaryClass = "flex min-h-12 cursor-pointer items-center rounded-md px-3 font-semibold text-brand hover:bg-brand-soft";

export default async function NutritionPlanEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/kostplaner/${id}`);
  if (!isUuid(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const { data: plan, error: planError } = await supabase.from("nutrition_plans").select("*").eq("id", id).maybeSingle();
  const back = { href: "/admin/kostplaner", label: "Tilbage til kostplaner" };
  if (planError) {
    return (
      <>
        <PageHeader title="Kostplan" back={back} />
        <Alert tone="danger">Kostplanen kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!plan) notFound();

  const [{ data: profile }, mealsRes, { data: otherDrafts }, purchasesRes, settings] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", plan.member_id).maybeSingle(),
    supabase.from("nutrition_meals").select("id, meal_type, title, description, position, created_at").eq("plan_id", plan.id),
    supabase.from("nutrition_plans").select("id, title, updated_at").eq("member_id", plan.member_id).eq("status", "draft").neq("id", plan.id),
    supabase.from("purchases").select("id, products(slug)").eq("user_id", plan.member_id).in("status", ["paid", "granted"]),
    getSiteSettings(),
  ]);
  const meals = mealsRes.data ?? [];
  // Same rule as public._has_addon(); the publish function checks it again.
  const missingAddon =
    !purchasesRes.error && !(purchasesRes.data ?? []).some((p) => (p.products as { slug?: string } | null)?.slug === "kostplan");
  const name = memberDisplayName(profile?.full_name, "medlemmet");
  const memberLine = (
    <>
      Kostplan til <MemberLink id={plan.member_id} name={profile?.full_name} />
    </>
  );
  const draftNotice =
    otherDrafts && otherDrafts.length > 0 ? (
      <Alert tone="info" title="Der findes andre kladder til samme medlem">
        <ul className="list-disc pl-6">
          {otherDrafts.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/kostplaner/${d.id}`} className="font-semibold text-brand underline underline-offset-4">
                {d.title}
              </Link>{" "}
              (senest ændret {formatShortDate(d.updated_at)})
            </li>
          ))}
        </ul>
      </Alert>
    ) : null;

  // ---- Published or archived: read-only ------------------------------------
  if (plan.status !== "draft") {
    const published = parseEmailOutcomeCode(firstParam(query.udgivet));
    return (
      <div className="space-y-8">
        <PageHeader title={plan.title} back={back} description={memberLine} />
        {published && plan.status === "published" ? (
          <Alert tone="success" title="Kostplanen er udgivet">
            Kostplanen er nu synlig for {name}, som har fået en notifikation på siden. {emailOutcomeText(published, name)}
          </Alert>
        ) : null}
        {firstParam(query.arkiveret) && plan.status === "archived" ? (
          <Alert tone="success" title="Kostplanen er arkiveret">
            {name} kan ikke længere se kostplanen.
          </Alert>
        ) : null}
        <PlanStatusBanner status={plan.status}>
          {plan.status === "published"
            ? `Kostplanen kan ikke ændres, fordi ${name} kan se den. Lav en ny version for at ændre den.${plan.published_at ? ` Udgivet ${formatDate(plan.published_at)}.` : ""}`
            : `Kostplanen er arkiveret og vises ikke længere som ${genitive(name)} kostplan. Du kan lave en ny version ud fra den.`}
        </PlanStatusBanner>
        {draftNotice}
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={createNutritionVersion} hidden={{ plan_id: plan.id }} pendingText="Laver en ny version…">
            <SubmitButton pendingText="Kopierer…">Lav ny version</SubmitButton>
          </ActionForm>
          {plan.status === "published" ? (
            <ActionForm action={archiveNutritionPlan} hidden={{ plan_id: plan.id }} pendingText="Arkiverer…">
              <ConfirmButton
                title="Arkivér kostplanen?"
                description={`${name} kan derefter ikke se en kostplan, før du udgiver en ny.`}
                confirmLabel="Ja, arkivér kostplanen"
              >
                Arkivér
              </ConfirmButton>
            </ActionForm>
          ) : null}
        </div>
        <div className="border-t border-line pt-8">
          <NutritionPlanView plan={plan} meals={meals} coachName={settings.coach_name} />
        </div>
      </div>
    );
  }

  // ---- Draft: editor ------------------------------------------------------------
  const groups = groupMeals(meals);
  const kopi = Boolean(firstParam(query.kopi));

  return (
    <div className="space-y-10">
      <PageHeader title={plan.title} back={back} description={memberLine} />
      {kopi ? (
        <Alert tone="success" title="Ny version oprettet">
          Dette er en ny kladde, kopieret med alle måltider. Den tidligere kostplan er uændret, indtil du udgiver denne.
        </Alert>
      ) : null}
      <PlanStatusBanner status="draft">{name} kan ikke se kostplanen, før du udgiver den.</PlanStatusBanner>
      {missingAddon ? (
        <Alert tone="warning" title={`${name} har ikke adgang til en kostplan`}>
          Kostplanen kan ikke udgives, før {name} har købt tilkøbet, eller du har givet adgang.{" "}
          <Link href={`/admin/medlemmer/${plan.member_id}`} className="font-semibold text-brand underline underline-offset-4">
            Gå til medlemmets side
          </Link>
        </Alert>
      ) : null}
      {draftNotice}
      {mealsRes.error ? <Alert tone="danger">Måltiderne kunne ikke hentes. Genindlæs siden, før du ændrer noget.</Alert> : null}

      <section aria-labelledby="tekster-titel" className="space-y-4">
        <SectionTitle id="tekster-titel">Kostplanens tekster</SectionTitle>
        <Panel>
          <ActionForm action={updateNutritionDetails} hidden={{ plan_id: plan.id }} pendingText="Gemmer…" className="space-y-5">
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue={plan.title} />
            <FormTextarea name="intro" label="Introduktion" optional rows={3} maxLength={4000} defaultValue={plan.intro ?? ""} />
            <FormTextarea
              name="meal_structure"
              label="Måltidsstruktur"
              optional
              rows={4}
              maxLength={8000}
              defaultValue={plan.meal_structure ?? ""}
              hint="F.eks. hvor mange måltider om dagen og hvornår."
            />
            <FormTextarea name="general_guidance" label="Generelle råd" optional rows={5} maxLength={8000} defaultValue={plan.general_guidance ?? ""} />
            <FormTextarea
              name="personal_notes"
              label={`Personlige noter fra ${settings.coach_name}`}
              optional
              rows={3}
              maxLength={6000}
              defaultValue={plan.personal_notes ?? ""}
              hint="Vises for medlemmet i en fremhævet boks."
            />
            <SubmitButton>Gem tekster</SubmitButton>
          </ActionForm>
        </Panel>
      </section>

      <section aria-labelledby="maaltider-titel" className="space-y-5">
        <SectionTitle id="maaltider-titel">Måltider ({meals.length})</SectionTitle>
        <p className="max-w-prose text-ink-soft">Måltiderne vises for medlemmet samlet efter tidspunkt på dagen. Rækkefølgen kan ændres inden for hvert tidspunkt.</p>
        {groups.length === 0 ? <EmptyState title="Ingen måltider endnu">Tilføj det første måltid herunder.</EmptyState> : null}

        {groups.map((g) => (
          <div key={g.type} className="space-y-3 rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h3 className="text-xl font-semibold">{g.label}</h3>
            <ol className="space-y-3">
              {g.meals.map((m, mi) => (
                <li key={m.id} className="space-y-3 rounded-md border border-line p-4">
                  <p className="text-lg font-semibold">{m.title}</p>
                  {m.description ? <p className="max-w-prose whitespace-pre-line">{m.description}</p> : null}
                  <div className="flex flex-wrap items-start gap-3">
                    <ActionForm action={moveMeal} hidden={{ meal_id: m.id }} pendingText="Flytter…" className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="direction" value="up" variant="ghost" size="sm" disabled={mi === 0} pendingText="Flytter…">
                          Flyt op<span className="sr-only">: {m.title}</span>
                        </SubmitButton>
                        <SubmitButton name="direction" value="down" variant="ghost" size="sm" disabled={mi === g.meals.length - 1} pendingText="Flytter…">
                          Flyt ned<span className="sr-only">: {m.title}</span>
                        </SubmitButton>
                      </div>
                    </ActionForm>
                    <ActionForm action={deleteMeal} hidden={{ meal_id: m.id }} pendingText="Sletter…" className="space-y-2">
                      <ConfirmButton title={`Slet måltidet “${m.title}”?`} description="Måltidet bliver slettet fra kostplanen. Det kan ikke fortrydes." confirmLabel="Ja, slet måltidet">
                        Slet måltid<span className="sr-only">: {m.title}</span>
                      </ConfirmButton>
                    </ActionForm>
                  </div>
                  <details>
                    <summary className={summaryClass}>
                      Ret måltidet<span className="sr-only">: {m.title}</span>
                    </summary>
                    <ActionForm action={updateMeal} hidden={{ meal_id: m.id }} pendingText="Gemmer…" className="mt-3 space-y-4">
                      <FormSelect name="meal_type" label="Tidspunkt" options={MEAL_OPTIONS} defaultValue={m.meal_type} />
                      <FormTextField name="title" label="Titel" required maxLength={160} defaultValue={m.title} />
                      <FormTextarea name="description" label="Beskrivelse" optional rows={3} maxLength={4000} defaultValue={m.description ?? ""} />
                      <SubmitButton>Gem måltidet</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        ))}

        <Panel>
          <h3 className="mb-4 text-xl font-semibold">Tilføj måltid</h3>
          <ActionForm action={addMeal} hidden={{ plan_id: plan.id }} pendingText="Tilføjer…">
            <FormSelect name="meal_type" label="Tidspunkt" placeholder="Vælg tidspunkt" required options={MEAL_OPTIONS} defaultValue="" />
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue="" hint="F.eks. “Havregryn med bær og skyr”." />
            <FormTextarea name="description" label="Beskrivelse" optional rows={3} maxLength={4000} defaultValue="" />
            <SubmitButton pendingText="Tilføjer…">Tilføj måltid</SubmitButton>
          </ActionForm>
        </Panel>
      </section>

      <section aria-labelledby="udgiv-titel" className="space-y-4">
        <SectionTitle id="udgiv-titel">Udgiv kostplanen</SectionTitle>
        <Panel className="space-y-6">
          <div className="space-y-3">
            <p>Se kostplanen, som {name} vil se den, før du udgiver den.</p>
            <ButtonLink href={`/admin/kostplaner/${plan.id}/forhaandsvisning`} variant="secondary">
              Forhåndsvis
            </ButtonLink>
          </div>
          <div className="space-y-3 border-t border-line pt-5">
            <ActionForm action={publishNutritionPlan} hidden={{ plan_id: plan.id }} pendingText="Udgiver kostplanen…">
              <ConfirmButton
                variant="primary"
                title={`Udgiv til ${name}?`}
                description={`Kostplanen bliver synlig for ${name}, og en eventuel tidligere kostplan bliver arkiveret.`}
                confirmLabel="Ja, udgiv kostplanen"
              >
                Udgiv til {name}
              </ConfirmButton>
            </ActionForm>
          </div>
          <div className="space-y-3 border-t border-line pt-5">
            <ActionForm action={deleteNutritionDraft} hidden={{ plan_id: plan.id }} pendingText="Sletter kladden…">
              <ConfirmButton
                title="Slet kladden?"
                description="Kladden og alle dens måltider bliver slettet. Det kan ikke fortrydes."
                confirmLabel="Ja, slet kladden"
              >
                Slet kladde
              </ConfirmButton>
            </ActionForm>
          </div>
        </Panel>
      </section>
    </div>
  );
}
