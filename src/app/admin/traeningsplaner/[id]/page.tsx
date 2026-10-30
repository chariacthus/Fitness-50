import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatShortDate } from "@/lib/format";
import { getSiteSettings } from "@/lib/settings";
import { BUCKETS } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";
import { createClient } from "@/lib/supabase/server";
import { exerciseFacts } from "@/lib/training/display";
import { loadPlanSessions } from "@/lib/training/queries";
import { emailOutcomeText, parseEmailOutcomeCode } from "@/lib/admin/email-outcome";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { genitive, memberDisplayName } from "@/lib/admin/members";
import { loadUploadLimits } from "@/lib/admin/queries";
import { sortByPosition } from "@/lib/admin/reorder";
import { ActionForm, FormTextarea, FormTextField } from "@/components/admin/action-form";
import { MemberLink } from "@/components/admin/member-link";
import { PlanStatusBanner } from "@/components/admin/plan-status";
import { PlanIntro, SessionList } from "@/components/training/plan-view";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addExercise,
  addSession,
  archivePlan,
  createNewVersion,
  deleteDraftPlan,
  deleteExercise,
  deleteSession,
  moveExercise,
  moveSession,
  publishPlan,
  updateExercise,
  updatePlanDetails,
  updateSession,
} from "./actions";
import { ExerciseVideo, type VideoChoice } from "./exercise-video";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Træningsplan" };

type ExerciseRow = {
  id: string;
  name: string;
  instructions: string | null;
  sets: number | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  video_url: string | null;
  media_id: string | null;
  notes: string | null;
  position: number;
  created_at: string;
};

const summaryClass = "flex min-h-12 cursor-pointer items-center rounded-md px-3 font-semibold text-brand hover:bg-brand-soft";

/** Fields shared by "add exercise" and "edit exercise". */
function ExerciseFields({ exercise }: { exercise?: ExerciseRow }) {
  return (
    <>
      <FormTextField name="name" label="Navn på øvelsen" required maxLength={160} defaultValue={exercise?.name ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormTextField name="sets" label="Sæt" optional inputMode="numeric" maxLength={2} defaultValue={exercise?.sets != null ? String(exercise.sets) : ""} hint="Et tal, f.eks. 3." />
        <FormTextField name="reps" label="Gentagelser" optional maxLength={40} defaultValue={exercise?.reps ?? ""} hint="F.eks. 8–12 eller 10 pr. ben." />
        <FormTextField name="duration" label="Varighed" optional maxLength={40} defaultValue={exercise?.duration ?? ""} hint="F.eks. 30 sekunder." />
        <FormTextField name="rest" label="Pause" optional maxLength={40} defaultValue={exercise?.rest ?? ""} hint="F.eks. 60 sekunder mellem sæt." />
      </div>
      <FormTextarea name="instructions" label="Sådan gør du" optional rows={4} maxLength={4000} defaultValue={exercise?.instructions ?? ""} />
      <FormTextarea name="notes" label="Bemærk" optional rows={2} maxLength={2000} defaultValue={exercise?.notes ?? ""} hint="F.eks. hvad medlemmet skal passe på." />
      <FormTextField
        name="video_url"
        label="Link til video"
        optional
        type="url"
        inputMode="url"
        defaultValue={exercise?.video_url ?? ""}
        hint="Et link til en video et andet sted, f.eks. YouTube. Skal starte med https://"
      />
    </>
  );
}

function MoveButtons({ first, last, what }: { first: boolean; last: boolean; what: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <SubmitButton name="direction" value="up" variant="ghost" size="sm" disabled={first} pendingText="Flytter…">
        Flyt op<span className="sr-only">: {what}</span>
      </SubmitButton>
      <SubmitButton name="direction" value="down" variant="ghost" size="sm" disabled={last} pendingText="Flytter…">
        Flyt ned<span className="sr-only">: {what}</span>
      </SubmitButton>
    </div>
  );
}

export default async function TrainingPlanEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await requireAdmin(`/admin/traeningsplaner/${id}`);
  if (!isUuid(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const { data: plan, error: planError } = await supabase.from("training_plans").select("*").eq("id", id).maybeSingle();
  const back = { href: "/admin/traeningsplaner", label: "Tilbage til træningsplaner" };
  if (planError) {
    return (
      <>
        <PageHeader title="Træningsplan" back={back} />
        <Alert tone="danger">Planen kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      </>
    );
  }
  if (!plan) notFound();

  const [{ data: profile }, { data: otherDrafts }, settings] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", plan.member_id).maybeSingle(),
    supabase.from("training_plans").select("id, title, updated_at").eq("member_id", plan.member_id).eq("status", "draft").neq("id", plan.id),
    getSiteSettings(),
  ]);
  const name = memberDisplayName(profile?.full_name, "medlemmet");
  const memberLine = (
    <>
      Træningsplan til <MemberLink id={plan.member_id} name={profile?.full_name} />
    </>
  );
  const draftNotice =
    otherDrafts && otherDrafts.length > 0 ? (
      <Alert tone="info" title="Der findes andre kladder til samme medlem">
        <ul className="list-disc pl-6">
          {otherDrafts.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/traeningsplaner/${d.id}`} className="font-semibold text-brand underline underline-offset-4">
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
    const { sessions, error: sessionsError } = await loadPlanSessions(supabase, plan.id);
    const published = parseEmailOutcomeCode(firstParam(query.udgivet));
    return (
      <div className="space-y-8">
        <PageHeader title={plan.title} back={back} description={memberLine} />
        {published && plan.status === "published" ? (
          <Alert tone="success" title="Planen er udgivet">
            Planen er nu synlig for {name}, som har fået en notifikation på siden. {emailOutcomeText(published, name)}
          </Alert>
        ) : null}
        {firstParam(query.arkiveret) && plan.status === "archived" ? (
          <Alert tone="success" title="Planen er arkiveret">
            {name} kan ikke længere se planen under Min træning, men den ligger stadig blandt tidligere planer.
          </Alert>
        ) : null}
        <PlanStatusBanner status={plan.status}>
          {plan.status === "published"
            ? `Planen kan ikke ændres, fordi ${name} kan se den. Lav en ny version for at ændre den – den nuværende plan er synlig, indtil du udgiver den nye.${plan.published_at ? ` Udgivet ${formatDate(plan.published_at)}.` : ""}`
            : `Planen er arkiveret og vises ikke længere som ${genitive(name)} aktuelle plan. Du kan lave en ny version ud fra den.`}
        </PlanStatusBanner>
        {draftNotice}
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={createNewVersion} hidden={{ plan_id: plan.id }} pendingText="Laver en ny version…">
            <SubmitButton pendingText="Kopierer…">Lav ny version</SubmitButton>
          </ActionForm>
          {plan.status === "published" ? (
            <ActionForm action={archivePlan} hidden={{ plan_id: plan.id }} pendingText="Arkiverer…">
              <ConfirmButton
                title="Arkivér planen?"
                description={`${name} har derefter ingen aktuel træningsplan, før du udgiver en ny. Planen kan stadig ses under tidligere planer.`}
                confirmLabel="Ja, arkivér planen"
              >
                Arkivér
              </ConfirmButton>
            </ActionForm>
          ) : null}
        </div>
        {sessionsError ? (
          <Alert tone="danger">Træningsdagene kunne ikke hentes lige nu.</Alert>
        ) : (
          <div className="space-y-10 border-t border-line pt-8">
            <PlanIntro plan={plan} coachName={settings.coach_name} />
            {sessions.length > 0 ? <SessionList sessions={sessions} heading="Træningsdage" /> : <p className="text-ink-soft">Planen har ingen træningsdage.</p>}
          </div>
        )}
      </div>
    );
  }

  // ---- Draft: editor ------------------------------------------------------------
  const [sessionsRes, libraryRes, limits] = await Promise.all([
    supabase
      .from("training_sessions")
      .select(
        "id, title, day_label, description, position, created_at, exercises(id, name, instructions, sets, reps, duration, rest, video_url, media_id, notes, position, created_at)",
      )
      .eq("plan_id", plan.id),
    supabase
      .from("media")
      .select("id, title, path, created_at")
      .eq("bucket", BUCKETS.trainingMedia)
      .eq("kind", "video")
      .order("created_at", { ascending: false })
      .limit(200),
    loadUploadLimits(supabase),
  ]);
  const sessions = sortByPosition(sessionsRes.data ?? []).map((s) => ({ ...s, exercises: sortByPosition(s.exercises as ExerciseRow[]) }));

  const library = libraryRes.data ?? [];
  const usedIds = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.media_id)).filter((m): m is string => Boolean(m)))];
  const missing = usedIds.filter((mid) => !library.some((m) => m.id === mid));
  const { data: extraMedia } = missing.length
    ? await supabase.from("media").select("id, title, path, created_at").in("id", missing)
    : { data: [] as typeof library };
  const mediaById = new Map([...library, ...(extraMedia ?? [])].map((m) => [m.id, m]));
  const urls = await signedUrls(
    supabase,
    BUCKETS.trainingMedia,
    usedIds.map((mid) => mediaById.get(mid)?.path),
  );
  const videoChoices: VideoChoice[] = library.map((m) => ({
    value: m.id,
    label: `${m.title?.trim() || "Video uden navn"} (uploadet ${formatShortDate(m.created_at)})`,
  }));
  const maxVideoBytes = limits.trainingVideoBytes;
  const kopi = Boolean(firstParam(query.kopi));

  return (
    <div className="space-y-10">
      <PageHeader title={plan.title} back={back} description={memberLine} />
      {kopi ? (
        <Alert tone="success" title="Ny version oprettet">
          Dette er en ny kladde, kopieret med alle træningsdage og øvelser. Den tidligere plan er uændret, indtil du udgiver denne.
        </Alert>
      ) : null}
      <PlanStatusBanner status="draft">{name} kan ikke se planen, før du udgiver den.</PlanStatusBanner>
      {draftNotice}
      {sessionsRes.error ? <Alert tone="danger">Træningsdagene kunne ikke hentes. Genindlæs siden, før du ændrer noget.</Alert> : null}

      <section aria-labelledby="oplysninger-titel" className="space-y-4">
        <SectionTitle id="oplysninger-titel">Planens oplysninger</SectionTitle>
        <Panel>
          <ActionForm action={updatePlanDetails} hidden={{ plan_id: plan.id }} pendingText="Gemmer…" className="space-y-5">
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue={plan.title} />
            <FormTextarea name="goal" label="Mål" optional rows={3} maxLength={1000} defaultValue={plan.goal ?? ""} />
            <FormTextarea name="description" label="Beskrivelse" optional rows={4} maxLength={6000} defaultValue={plan.description ?? ""} />
            <FormTextarea
              name="coach_notes"
              label={`Noter fra ${settings.coach_name}`}
              optional
              rows={3}
              maxLength={6000}
              defaultValue={plan.coach_notes ?? ""}
              hint="Vises for medlemmet i en fremhævet boks øverst i planen."
            />
            <SubmitButton>Gem oplysninger</SubmitButton>
          </ActionForm>
        </Panel>
      </section>

      <section aria-labelledby="dage-titel" className="space-y-5">
        <SectionTitle id="dage-titel">Træningsdage ({sessions.length})</SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState title="Ingen træningsdage endnu">
            Tilføj den første træningsdag herunder. En plan skal have mindst én træningsdag, før den kan udgives.
          </EmptyState>
        ) : null}

        {sessions.map((s, si) => (
          <article key={s.id} aria-labelledby={`dag-${s.id}`} className="rounded-lg border border-line bg-surface">
            <header className="space-y-3 border-b border-line p-5 sm:p-6">
              {s.day_label ? <p className="font-semibold text-brand">{s.day_label}</p> : null}
              <h3 id={`dag-${s.id}`} className="text-2xl font-semibold">
                <span className="text-ink-soft">Dag {si + 1}:</span> {s.title}
              </h3>
              {s.description ? <p className="max-w-prose whitespace-pre-line text-ink-soft">{s.description}</p> : null}
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm action={moveSession} hidden={{ session_id: s.id }} pendingText="Flytter…" className="space-y-2">
                  <MoveButtons first={si === 0} last={si === sessions.length - 1} what={s.title} />
                </ActionForm>
                <ActionForm action={deleteSession} hidden={{ session_id: s.id }} pendingText="Sletter…" className="space-y-2">
                  <ConfirmButton
                    title={`Slet “${s.title}”?`}
                    description={`Træningsdagen og ${s.exercises.length === 1 ? "dens ene øvelse" : `alle dens ${s.exercises.length} øvelser`} bliver slettet. Det kan ikke fortrydes.`}
                    confirmLabel="Ja, slet træningsdagen"
                  >
                    Slet træningsdag<span className="sr-only">: {s.title}</span>
                  </ConfirmButton>
                </ActionForm>
              </div>
              <details>
                <summary className={summaryClass}>Ret træningsdagen</summary>
                <ActionForm action={updateSession} hidden={{ session_id: s.id }} pendingText="Gemmer…" className="mt-3 space-y-4">
                  <FormTextField name="title" label="Titel" required maxLength={160} defaultValue={s.title} />
                  <FormTextField name="day_label" label="Dag" optional maxLength={60} defaultValue={s.day_label ?? ""} hint="F.eks. Mandag eller Dag 1." />
                  <FormTextarea name="description" label="Beskrivelse" optional rows={3} maxLength={4000} defaultValue={s.description ?? ""} />
                  <SubmitButton>Gem træningsdagen</SubmitButton>
                </ActionForm>
              </details>
            </header>

            <div className="space-y-4 p-5 sm:p-6">
              <h4 className="text-xl font-semibold">Øvelser ({s.exercises.length})</h4>
              {s.exercises.length === 0 ? <p className="text-ink-soft">Der er ingen øvelser på denne træningsdag endnu.</p> : null}
              <ol className="space-y-4">
                {s.exercises.map((e, ei) => {
                  const facts = exerciseFacts(e);
                  const media = e.media_id ? mediaById.get(e.media_id) : undefined;
                  return (
                    <li key={e.id} className="space-y-3 rounded-md border border-line p-4">
                      <p className="text-lg font-semibold">
                        <span className="text-ink-soft">{ei + 1}.</span> {e.name}
                      </p>
                      {facts.length > 0 ? <p className="text-ink-soft">{facts.map((f) => `${f.label}: ${f.value}`).join(" · ")}</p> : null}
                      <p className="text-ink-soft">
                        {media ? `Video: ${media.title?.trim() || "Video uden navn"}` : "Ingen uploadet video"}
                        {e.video_url ? " · Har link til video" : ""}
                      </p>
                      <div className="flex flex-wrap items-start gap-3">
                        <ActionForm action={moveExercise} hidden={{ exercise_id: e.id }} pendingText="Flytter…" className="space-y-2">
                          <MoveButtons first={ei === 0} last={ei === s.exercises.length - 1} what={e.name} />
                        </ActionForm>
                        <ActionForm action={deleteExercise} hidden={{ exercise_id: e.id }} pendingText="Sletter…" className="space-y-2">
                          <ConfirmButton title={`Slet øvelsen “${e.name}”?`} description="Øvelsen bliver slettet fra træningsdagen. Det kan ikke fortrydes." confirmLabel="Ja, slet øvelsen">
                            Slet øvelse<span className="sr-only">: {e.name}</span>
                          </ConfirmButton>
                        </ActionForm>
                      </div>
                      <details>
                        <summary className={summaryClass}>
                          Ret øvelsen<span className="sr-only">: {e.name}</span>
                        </summary>
                        <ActionForm action={updateExercise} hidden={{ exercise_id: e.id }} pendingText="Gemmer…" className="mt-3 space-y-4">
                          <ExerciseFields exercise={e} />
                          <SubmitButton>Gem øvelsen</SubmitButton>
                        </ActionForm>
                      </details>
                      <details>
                        <summary className={summaryClass}>
                          Video af øvelsen<span className="sr-only">: {e.name}</span>
                        </summary>
                        <div className="mt-3">
                          <ExerciseVideo
                            exerciseId={e.id}
                            exerciseName={e.name}
                            current={media ? { id: media.id, title: media.title?.trim() || "Video uden navn", url: urls.get(media.path) ?? null } : null}
                            library={videoChoices}
                            maxBytes={maxVideoBytes}
                          />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
              <details className="rounded-md border border-dashed border-line-strong p-2">
                <summary className={summaryClass}>
                  Tilføj øvelse<span className="sr-only"> til {s.title}</span>
                </summary>
                <ActionForm action={addExercise} hidden={{ session_id: s.id }} pendingText="Tilføjer…" className="mt-3 space-y-4 p-2">
                  <ExerciseFields />
                  <SubmitButton pendingText="Tilføjer…">Tilføj øvelsen</SubmitButton>
                </ActionForm>
              </details>
            </div>
          </article>
        ))}

        <Panel>
          <h3 className="mb-4 text-xl font-semibold">Tilføj træningsdag</h3>
          <ActionForm action={addSession} hidden={{ plan_id: plan.id }} pendingText="Tilføjer…">
            <FormTextField name="title" label="Titel" required maxLength={160} defaultValue="" hint="F.eks. “Styrke – hele kroppen”." />
            <FormTextField name="day_label" label="Dag" optional maxLength={60} defaultValue="" hint="F.eks. Mandag eller Dag 1." />
            <FormTextarea name="description" label="Beskrivelse" optional rows={3} maxLength={4000} defaultValue="" />
            <SubmitButton pendingText="Tilføjer…">Tilføj træningsdag</SubmitButton>
          </ActionForm>
        </Panel>
      </section>

      <section aria-labelledby="udgiv-titel" className="space-y-4">
        <SectionTitle id="udgiv-titel">Udgiv planen</SectionTitle>
        <Panel className="space-y-6">
          <div className="space-y-3">
            <p>Se planen, som {name} vil se den, før du udgiver den.</p>
            <ButtonLink href={`/admin/traeningsplaner/${plan.id}/forhaandsvisning`} variant="secondary">
              Forhåndsvis
            </ButtonLink>
          </div>
          <div className="space-y-3 border-t border-line pt-5">
            {sessions.length === 0 ? <p id="udgiv-grund">Tilføj mindst én træningsdag, før planen kan udgives.</p> : null}
            <ActionForm action={publishPlan} hidden={{ plan_id: plan.id }} pendingText="Udgiver planen…">
              <ConfirmButton
                variant="primary"
                title={`Udgiv til ${name}?`}
                description={`Planen bliver synlig for ${name}, og en eventuel tidligere plan bliver arkiveret.`}
                confirmLabel="Ja, udgiv planen"
                disabled={sessions.length === 0}
              >
                Udgiv til {name}
              </ConfirmButton>
            </ActionForm>
          </div>
          <div className="space-y-3 border-t border-line pt-5">
            <ActionForm action={deleteDraftPlan} hidden={{ plan_id: plan.id }} pendingText="Sletter kladden…">
              <ConfirmButton
                title="Slet kladden?"
                description="Kladden og alle dens træningsdage og øvelser bliver slettet. Det kan ikke fortrydes."
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
