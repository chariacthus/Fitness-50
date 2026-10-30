import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { exerciseFacts } from "@/lib/training/display";
import type { ExerciseView, SessionView } from "@/lib/training/queries";
import { SectionTitle } from "@/components/ui/layout";

// Read-only presentation of a training plan. Used for the current plan
// (with completion controls passed in per session) and for archived plans.

export type PlanSummary = {
  title: string;
  goal: string | null;
  description: string | null;
  coach_notes: string | null;
  updated_at: string;
};

function Paragraphs({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  return <p className={`whitespace-pre-line ${className ?? ""}`}>{text.trim()}</p>;
}

export function PlanIntro({ plan, coachName }: { plan: PlanSummary; coachName: string }) {
  return (
    <section aria-labelledby="plan-title" className="space-y-5">
      <div className="space-y-2">
        <h2 id="plan-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {plan.title}
        </h2>
        <p className="text-ink-soft">Senest opdateret {formatDate(plan.updated_at)}</p>
      </div>
      {plan.goal?.trim() ? (
        <div>
          <h3 className="text-lg font-semibold">Mål</h3>
          <Paragraphs text={plan.goal} />
        </div>
      ) : null}
      <Paragraphs text={plan.description} className="max-w-prose" />
      {plan.coach_notes?.trim() ? (
        <div className="rounded-md border-l-4 border-brand bg-brand-soft px-4 py-3">
          <h3 className="font-semibold">Noter fra {coachName}</h3>
          <Paragraphs text={plan.coach_notes} className="mt-1" />
        </div>
      ) : null}
    </section>
  );
}

function ExerciseMediaBlock({ exercise }: { exercise: ExerciseView }) {
  return (
    <>
      {exercise.media?.kind === "video" ? (
        <video
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-md bg-black"
          aria-label={`Video af øvelsen: ${exercise.name}`}
          src={exercise.media.url}
        >
          <p>
            Din browser kan ikke afspille videoen her.{" "}
            <a href={exercise.media.url} className="font-semibold text-brand underline underline-offset-4">
              Åbn videoen
            </a>
          </p>
        </video>
      ) : null}
      {exercise.media?.kind === "image" ? (
        // Signed, short-lived URL from private storage – shown as-is.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={exercise.media.url} alt={exercise.media.title ?? `Billede af øvelsen: ${exercise.name}`} className="w-full rounded-md" />
      ) : null}
      {exercise.videoUrl ? (
        <p>
          <a
            href={exercise.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
          >
            Se video af øvelsen<span className="font-normal">&nbsp;(åbner i en ny fane)</span>
          </a>
        </p>
      ) : null}
    </>
  );
}

function ExerciseItem({ exercise, index }: { exercise: ExerciseView; index: number }) {
  const facts = exerciseFacts(exercise);
  return (
    <li className="space-y-3 py-5 first:pt-0 last:pb-0">
      <h4 className="text-xl font-semibold">
        <span className="text-ink-soft">{index + 1}.</span> {exercise.name}
      </h4>
      {facts.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-ink-soft">{f.label}</dt>
              <dd className="text-lg font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {exercise.instructions?.trim() ? (
        <div>
          <p className="font-semibold">Sådan gør du</p>
          <Paragraphs text={exercise.instructions} className="max-w-prose" />
        </div>
      ) : null}
      {exercise.notes?.trim() ? (
        <div>
          <p className="font-semibold">Bemærk</p>
          <Paragraphs text={exercise.notes} className="max-w-prose" />
        </div>
      ) : null}
      <ExerciseMediaBlock exercise={exercise} />
    </li>
  );
}

export function SessionList({
  sessions,
  heading = "Træningerne i din plan",
  sessionFooter,
}: {
  sessions: SessionView[];
  heading?: string;
  /** Extra content per session id (e.g. completion controls). */
  sessionFooter?: Record<string, ReactNode>;
}) {
  return (
    <section aria-labelledby="sessions-title" className="space-y-5">
      <SectionTitle id="sessions-title">{heading}</SectionTitle>
      {sessions.map((s) => (
        <article
          key={s.id}
          id={`session-${s.id}`}
          aria-labelledby={`session-${s.id}-title`}
          className="scroll-mt-24 space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6"
        >
          <header className="space-y-1">
            {s.day_label?.trim() ? <p className="font-semibold text-brand">{s.day_label}</p> : null}
            <h3 id={`session-${s.id}-title`} className="text-2xl font-semibold">
              {s.title}
            </h3>
            <Paragraphs text={s.description} className="max-w-prose text-ink-soft" />
          </header>
          {s.exercises.length > 0 ? (
            <ol className="divide-y divide-line">
              {s.exercises.map((e, i) => (
                <ExerciseItem key={e.id} exercise={e} index={i} />
              ))}
            </ol>
          ) : (
            <p className="text-ink-soft">Der er ingen øvelser i denne træning endnu.</p>
          )}
          {sessionFooter?.[s.id] ? <div className="border-t border-line pt-4">{sessionFooter[s.id]}</div> : null}
        </article>
      ))}
    </section>
  );
}
