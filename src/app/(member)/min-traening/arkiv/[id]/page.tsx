import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireEntitledViewer } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { loadPlanSessions } from "@/lib/training/queries";
import { PlanIntro, SessionList } from "@/components/training/plan-view";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Tidligere plan" };

export default async function ArchivedPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const viewer = await requireEntitledViewer(`/min-traening/arkiv/${id}`);
  const supabase = await createClient();
  const [settings, planRes] = await Promise.all([
    getSiteSettings(),
    // RLS only returns the member's own non-draft plans; member_id is also
    // filtered explicitly so administrators only see their own plans here.
    supabase
      .from("training_plans")
      .select("id, title, goal, description, coach_notes, status, archived_at, updated_at")
      .eq("id", id)
      .eq("member_id", viewer.userId)
      .maybeSingle(),
  ]);

  const back = { href: "/min-traening", label: "Tilbage til Min træning" };

  if (planRes.error) {
    return (
      <>
        <PageHeader title="Tidligere plan" back={back} />
        <Alert tone="danger">Vi kunne ikke hente planen lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }

  const plan = planRes.data;
  if (!plan || plan.status === "draft") notFound();
  if (plan.status === "published") redirect("/min-traening");

  const loaded = await loadPlanSessions(supabase, plan.id);

  return (
    <>
      <PageHeader title="Tidligere plan" back={back} />
      <div className="space-y-10">
        <Alert tone="warning" title="Tidligere plan (arkiveret) – ikke din aktuelle plan">
          {plan.archived_at ? `Planen blev arkiveret ${formatDate(plan.archived_at)}. ` : null}
          Din aktuelle plan finder du under Min træning.
        </Alert>
        <PlanIntro plan={plan} coachName={settings.coach_name} />
        {loaded.error ? (
          <Alert tone="danger">Vi kunne ikke hente træningerne i planen lige nu. Genindlæs siden om lidt.</Alert>
        ) : loaded.sessions.length === 0 ? (
          <EmptyState title="Planen havde ingen træninger" />
        ) : (
          <SessionList sessions={loaded.sessions} heading="Træningerne i planen" />
        )}
      </div>
    </>
  );
}
