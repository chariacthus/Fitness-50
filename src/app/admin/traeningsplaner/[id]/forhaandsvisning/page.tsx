import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { loadPlanSessions } from "@/lib/training/queries";
import { isUuid } from "@/lib/admin/forms";
import { memberDisplayName } from "@/lib/admin/members";
import { PlanIntro, SessionList } from "@/components/training/plan-view";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Forhåndsvisning af træningsplan" };

/** The plan rendered exactly like the member's "Min træning" view, read-only. */
export default async function TrainingPlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/traeningsplaner/${id}/forhaandsvisning`);
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("training_plans")
    .select("id, member_id, title, goal, description, coach_notes, status, updated_at")
    .eq("id", id)
    .maybeSingle();
  const back = { href: `/admin/traeningsplaner/${id}`, label: "Tilbage til redigering" };
  if (error) {
    return (
      <>
        <PageHeader title="Forhåndsvisning" back={back} />
        <Alert tone="danger">Planen kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!plan) notFound();

  const [{ data: profile }, settings, { sessions, error: sessionsError }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", plan.member_id).maybeSingle(),
    getSiteSettings(),
    loadPlanSessions(supabase, plan.id),
  ]);
  const name = memberDisplayName(profile?.full_name, "medlemmet");

  return (
    <div className="space-y-8">
      <PageHeader title="Forhåndsvisning" back={back} />
      <Alert tone="info" title={`Sådan ser planen ud for ${name}`}>
        {plan.status === "draft"
          ? `Planen er en kladde og er ikke synlig for ${name} endnu. Gå tilbage til redigering for at ændre eller udgive den.`
          : plan.status === "published"
            ? `Planen er udgivet og er synlig for ${name}.`
            : "Planen er arkiveret."}
        <span className="mt-3 block">
          <ButtonLink href={back.href} variant="secondary" size="sm">
            Tilbage til redigering
          </ButtonLink>
        </span>
      </Alert>

      {sessionsError ? (
        <Alert tone="danger">Træningsdagene kunne ikke hentes lige nu.</Alert>
      ) : (
        <div className="space-y-10 rounded-lg border-2 border-dashed border-line-strong bg-canvas p-4 sm:p-6">
          <PlanIntro plan={plan} coachName={settings.coach_name} />
          {sessions.length > 0 ? (
            <SessionList sessions={sessions} />
          ) : (
            <p className="text-ink-soft">Planen har ingen træningsdage endnu.</p>
          )}
        </div>
      )}
    </div>
  );
}
