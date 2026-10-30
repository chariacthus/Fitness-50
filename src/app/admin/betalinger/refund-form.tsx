"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-result";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import { refundPurchase } from "./actions";

export function RefundForm({ purchaseId, description }: { purchaseId: string; description: string }) {
  const [state, formAction, pending] = useActionState(refundPurchase, initialActionState);
  const done = state.ok;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      {pending ? (
        <Spinner label="Opretter refusion…" />
      ) : done ? null : (
        <ConfirmButton
          title="Refunder betalingen?"
          description={
            <p>
              {description} Pengene sendes tilbage til kunden via Stripe. Det kan ikke fortrydes. Adgangen til tilkøbet
              fjernes, når Stripe har bekræftet refusionen.
            </p>
          }
          confirmLabel="Ja, refunder"
        >
          Refunder
        </ConfirmButton>
      )}
      <div aria-live="polite">
        <FormMessage state={state} successTitle="Refusion oprettet" />
      </div>
    </form>
  );
}
