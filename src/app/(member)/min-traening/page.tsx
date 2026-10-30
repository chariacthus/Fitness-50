import type { Metadata } from "next";
import Link from "next/link";
import { requireEntitledViewer } from "@/lib/auth";
import { formatDate, todayInCopenhagen } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { loadPlanSessions } from "@/lib/training/queries";
import { copenhagenWeek, countWorkouts, formatDay, summarizeCompletions } from "@/lib/training/week";
import { resumeStep } from "@/components/onboarding/steps";
import { PlanIntro, SessionList } from "@/components/training/plan-view";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { CompletionForm } from "./completion-form";

export const metadata: Metadata = { title: "Min træning" };

export default async function MyTrainingPage() {
  const viewer = await requireEntitledViewer("/min-traening");
  const supabase = await createClient();

  const [settings, plansRes, onboardingRes, addonRes] = await Promise.all([
    getSiteSettings(),
    supabase
      .from("training_plans")
      .select("id, title, goal, description, coach_notes, status, published_at, archived_at, updated_at, created_at")
      .eq("member_id", viewer.userId)
      .in("status", ["published", "archived"])
      .order("created_at", { ascending: false }),
    supabase.from("onboarding_submissions").select("status, current_step").eq("user_id", viewer.userId).maybeSingle(),
    supabase.rpc("has_addon", { p_slug: "kostplan" }),
  ]);
  const coach = settings.coach_name;
  const hasNutrition = addonRes.data === true;

  const plans = plansRes.data ?? [];
  const plan = plans.find((p) => p.status === "published") ?? null;
  const archived = plans
    .filter((p) => p.status === "archived")
    .sort((a, b) => (b.archived_at ?? b.created_at).localeCompare(a.archived_at ?? a.created_at));

  const loaded = plan ? await loadPlanSessions(supabase, plan.id) : { sessions: [], error: false };
  const sessionIds = loaded.sessions.map((s) => s.id);
  const completionsRes =
    sessionIds.length > 0
      ? await supabase
          .from("workout_completions")
          .select("session_id, completed_on")
          .eq("member_id", viewer.userId)
          .in("session_id", sessionIds)
          .order("completed_on", { ascending: false })
          .limit(500)
      : { data: [], error: null };

  const today = todayInCopenhagen();
  const week = copenhagenWeek();
  const summary = summarizeCompletions(completionsRes.data ?? [], week, today);

  const onboarding = onboardingRes.data;
  const onboardingSubmitted = onboarding?.status === "submitted" || onboarding?.status === "reviewed";

  return (
    <>
      <PageHeader title="Min træning" description={`Din personlige træningsplan fra ${coach}.`} />

      <div className="space-y-12">
        {plansRes.error ? (
          <Alert tone="danger">Vi kunne ikke hente din træningsplan lige nu. Genindlæs siden om lidt.</Alert>
        ) : plan ? (
          <>
            <PlanIntro plan={plan} coachName={coach} />

            <section aria-labelledby="week-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h2 id="week-title" className="text-xl font-semibold">
                Denne uge
              </h2>
              {completionsRes.error ? (
                <p className="mt-1 text-ink-soft">Vi kunne ikke hente dine gennemførte træninger lige nu.</p>
              ) : (
                <>
                  <p className="mt-1 text-lg">
                    Du har gennemført <strong>{countWorkouts(summary.thisWeek)}</strong> i denne uge (mandag til søndag).
                  </p>
                  <p className="text-ink-soft">
                    {summary.lastCompletedOn
                      ? `Senest gennemført: ${formatDay(summary.lastCompletedOn)}`
                      : "Du har ikke markeret nogen træninger som gennemført endnu."}
                  </p>
                </>
              )}
            </section>

            {loaded.error ? (
              <Alert tone="danger">Vi kunne ikke hente træningerne i din plan lige nu. Genindlæs siden om lidt.</Alert>
            ) : loaded.sessions.length === 0 ? (
              <EmptyState title="Planen har ingen træninger endnu">{coach} er ved at lægge træningerne ind.</EmptyState>
            ) : (
              <SessionList
                sessions={loaded.sessions}
                sessionFooter={Object.fromEntries(
                  loaded.sessions.map((s) => {
                    const last = summary.lastBySession.get(s.id);
                    return [
                      s.id,
                      <CompletionForm
                        key={s.id}
                        sessionId={s.id}
                        sessionTitle={s.title}
                        completedToday={summary.completedToday.has(s.id)}
                        lastCompleted={last ? formatDay(last) : null}
                      />,
                    ];
                  }),
                )}
              />
            )}
          </>
        ) : onboardingSubmitted ? (
          <EmptyState title={`${coach} arbejder på din plan`}>
            Tak for dine svar på spørgeskemaet. Du får en notifikation, så snart din personlige træningsplan er klar.
          </EmptyState>
        ) : (
          <EmptyState
            title="Udfyld spørgeskemaet først"
            action={
              <ButtonLink href={onboarding ? `/onboarding?trin=${resumeStep(onboarding.current_step)}` : "/onboarding"} size="lg">
                {onboarding ? "Fortsæt spørgeskemaet" : "Udfyld spørgeskemaet"}
              </ButtonLink>
            }
          >
            {coach} laver din træningsplan ud fra dine svar om mål, hverdag og erfaring.
          </EmptyState>
        )}

        {hasNutrition ? (
          <Panel>
            <SectionTitle>Din kostplan</SectionTitle>
            <p className="mt-2 text-ink-soft">Din personlige kostplan ligger på sin egen side.</p>
            <div className="mt-4">
              <ButtonLink href="/min-traening/kostplan" variant="secondary">
                Se min kostplan
              </ButtonLink>
            </div>
          </Panel>
        ) : null}

        {archived.length > 0 ? (
          <section aria-labelledby="archive-title" className="space-y-4">
            <SectionTitle id="archive-title">Tidligere planer</SectionTitle>
            <p className="text-ink-soft">Planer, du har fulgt før. De er gemt, så du kan se tilbage på dem.</p>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {archived.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/min-traening/arkiv/${p.id}`}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-muted"
                  >
                    <span className="font-semibold text-brand underline-offset-4 hover:underline">{p.title}</span>
                    <span className="text-ink-soft">
                      {p.archived_at ? `Arkiveret ${formatDate(p.archived_at)}` : "Arkiveret"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
