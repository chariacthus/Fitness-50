"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-result";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { setSessionCompletion } from "./actions";

/** "Markér som gennemført" / "Gennemført i dag" + "Fortryd" for one session. */
export function CompletionForm({
  sessionId,
  sessionTitle,
  completedToday,
  lastCompleted,
}: {
  sessionId: string;
  sessionTitle: string;
  completedToday: boolean;
  /** Already formatted date of the latest completion, if any. */
  lastCompleted: string | null;
}) {
  const [state, formAction] = useActionState(setSessionCompletion, initialActionState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="mode" value={completedToday ? "undo" : "complete"} />
      {completedToday ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex min-h-11 items-center gap-2 rounded-md bg-success-soft px-4 font-semibold text-success">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" />
            </svg>
            Gennemført i dag
          </p>
          <SubmitButton variant="secondary" size="sm" pendingText="Fortryder…">
            Fortryd<span className="sr-only">: {sessionTitle}</span>
          </SubmitButton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SubmitButton pendingText="Gemmer…">
            Markér som gennemført<span className="sr-only">: {sessionTitle}</span>
          </SubmitButton>
          {lastCompleted ? <p className="text-ink-soft">Senest gennemført {lastCompleted}</p> : null}
        </div>
      )}
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
