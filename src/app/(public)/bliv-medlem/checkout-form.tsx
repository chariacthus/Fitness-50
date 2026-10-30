"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { initialActionState } from "@/lib/action-result";
import { CheckboxField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { startMembershipCheckout } from "./actions";

export function MembershipCheckoutForm() {
  const [state, formAction] = useActionState(startMembershipCheckout, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const consentError = state.ok ? undefined : state.fieldErrors?.consent;

  useEffect(() => {
    if (consentError) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [consentError, state]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      <CheckboxField
        name="consent"
        aria-required="true"
        error={consentError}
        label={
          <>
            Jeg ønsker, at medlemskabet starter med det samme, og jeg har læst reglerne om fortrydelsesret i{" "}
            <Link href="/handelsbetingelser" className="font-semibold text-brand underline underline-offset-4">
              handelsbetingelserne
            </Link>
          </>
        }
      />
      <div aria-live="polite">{consentError ? null : <FormMessage state={state} />}</div>
      <SubmitButton size="lg" pendingText="Åbner betalingssiden…" className="w-full sm:w-auto">
        Gå til sikker betaling
      </SubmitButton>
    </form>
  );
}
