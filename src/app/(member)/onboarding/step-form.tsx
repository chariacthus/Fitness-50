"use client";

import { useActionState, useEffect, useRef } from "react";
import { initialStepState, type FormStepKey, type StepValues } from "@/components/onboarding/steps";
import { StepFields } from "@/components/onboarding/step-fields";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveStep } from "./actions";

type Props = {
  step: number;
  stepKey: FormStepKey;
  /** Saved answers for this step (used until the member submits). */
  defaults: StepValues;
  coachName: string;
  businessName: string;
  hasNutritionAddon: boolean;
  hadHealthConsent: boolean;
};

/**
 * One questionnaire step. Each step is its own form; the three buttons all
 * save. Render with key={step} so the form state starts fresh on every step.
 */
export function StepForm({ step, stepKey, defaults, coachName, businessName, hasNutritionAddon, hadHealthConsent }: Props) {
  const [state, formAction] = useActionState(saveStep, initialStepState);
  const formRef = useRef<HTMLFormElement>(null);
  const values = state.values ?? defaults;
  const fieldErrors = state.ok ? undefined : state.fieldErrors;

  // Move keyboard/screen reader focus to the first field with an error.
  useEffect(() => {
    if (!fieldErrors || Object.keys(fieldErrors).length === 0) return;
    const form = formRef.current;
    if (!form) return;
    const invalidInput = form.querySelector<HTMLElement>("[aria-invalid='true']");
    const invalidGroup = form.querySelector("fieldset [id$='-error']")?.closest("fieldset")?.querySelector<HTMLElement>("input");
    const first = [invalidInput, invalidGroup]
      .filter((el): el is HTMLElement => Boolean(el))
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
    first?.focus();
  }, [fieldErrors]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-10">
      <input type="hidden" name="step" value={step} />
      <StepFields
        stepKey={stepKey}
        values={values}
        errors={fieldErrors}
        coachName={coachName}
        businessName={businessName}
        hasNutritionAddon={hasNutritionAddon}
        hadHealthConsent={hadHealthConsent}
      />

      <div aria-live="polite">
        <FormMessage state={state} />
      </div>

      {/* "Gem og fortsæt" comes first, so pressing Enter in a field continues. */}
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:flex-wrap sm:items-center">
        <SubmitButton name="intent" value="next" size="lg">
          Gem og fortsæt
        </SubmitButton>
        {step > 1 ? (
          <SubmitButton name="intent" value="back" variant="secondary" size="lg">
            Tilbage
          </SubmitButton>
        ) : null}
        <SubmitButton name="intent" value="later" variant="ghost" size="lg" className="underline">
          Gem og fortsæt senere
        </SubmitButton>
      </div>
    </form>
  );
}
