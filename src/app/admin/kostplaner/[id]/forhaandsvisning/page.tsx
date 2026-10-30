import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { memberDisplayName } from "@/lib/admin/members";
import { NutritionPlanView } from "@/components/admin/nutrition-plan-view";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Forhåndsvisning af kostplan" };

/** The nutrition plan rendered the way the member sees it, read-only. */
export default async function NutritionPlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/kostplaner/${id}/forhaandsvisning`);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("nutrition_plans")
    .select("id, member_id, title, intro, meal_structure, general_guidance, personal_notes, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  const back = { href: `/admin/kostplaner/${id}`, label: "Tilbage til redigering" };
  if (error) {
    return (
      <>
        <PageHeader title="Forhåndsvisning" back={back} />
        <Alert tone="danger">Kostplanen kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!plan) notFound();

  const [{ data: profile }, mealsRes, settings] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", plan.member_id).maybeSingle(),
    supabase.from("nutrition_meals").select("id, meal_type, title, description, position").eq("plan_id", plan.id),
    getSiteSettings(),
  ]);
  const name = memberDisplayName(profile?.full_name, "medlemmet");

  return (
    <div className="space-y-8">
      <PageHeader title="Forhåndsvisning" back={back} />
      <Alert tone="info" title={`Sådan ser kostplanen ud for ${name}`}>
        {plan.status === "draft"
          ? `Kostplanen er en kladde og er ikke synlig for ${name} endnu. Gå tilbage til redigering for at ændre eller udgive den.`
          : plan.status === "published"
            ? `Kostplanen er udgivet og er synlig for ${name}.`
            : "Kostplanen er arkiveret."}
        <span className="mt-3 block">
          <ButtonLink href={back.href} variant="secondary" size="sm">
            Tilbage til redigering
          </ButtonLink>
        </span>
      </Alert>
      {mealsRes.error ? (
        <Alert tone="danger">Måltiderne kunne ikke hentes lige nu.</Alert>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-line-strong bg-canvas p-4 sm:p-6">
          <NutritionPlanView plan={plan} meals={mealsRes.data ?? []} coachName={settings.coach_name} />
        </div>
      )}
    </div>
  );
}
