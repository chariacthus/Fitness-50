"use client";

import Link from "next/link";
import { useActionState } from "react";
import { initialSubmitState, stepTitle } from "@/components/onboarding/steps";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { reopenOnboarding, submitOnboarding } from "./actions";

/** "Send til Christian" on the review step. Shows which step is incomplete if sending fails. */
export function SubmitOnboardingForm({ coachName, resubmit }: { coachName: string; resubmit: boolean }) {
  const [state, formAction] = useActionState(submitOnboarding, initialSubmitState);
  const incomplete = !state.ok ? state.incompleteStep : undefined;
  return (
    <form action={formAction} className="space-y-4">
      <div aria-live="polite" className="space-y-3">
        <FormMessage state={state} />
        {incomplete ? (
          <p>
            <Link
              href={`/onboarding?trin=${incomplete}`}
              className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
            >
              Gå til trin {incomplete}: {stepTitle(incomplete)}
            </Link>
          </p>
        ) : null}
      </div>
      <SubmitButton size="lg" pendingText="Sender…">
        {resubmit ? `Send igen til ${coachName}` : `Send til ${coachName}`}
      </SubmitButton>
    </form>
  );
}

/** "Ret mine svar" on the read-only summary: turns the questionnaire back into a draft. */
export function ReopenOnboardingForm({ step }: { step: number }) {
  const [state, formAction] = useActionState(reopenOnboarding, initialSubmitState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="trin" value={step} />
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
      <SubmitButton variant="secondary" size="lg" pendingText="Åbner…">
        Ret mine svar
      </SubmitButton>
    </form>
  );
}
