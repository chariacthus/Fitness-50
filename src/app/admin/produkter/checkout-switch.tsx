"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/action-result";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { setCheckoutEnabled } from "./actions";

/** Opens or closes checkout (admin_settings.checkout_enabled). */
export function CheckoutSwitch({ enabled, canEnable }: { enabled: boolean; canEnable: boolean }) {
  const [state, formAction] = useActionState(setCheckoutEnabled, initialActionState);
  return (
    <div className="space-y-3">
      {enabled || canEnable ? (
        <form action={formAction}>
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <SubmitButton variant={enabled ? "secondary" : "primary"} pendingText="Gemmer…">
            {enabled ? "Luk tilmelding og køb" : "Åbn tilmelding og køb"}
          </SubmitButton>
        </form>
      ) : (
        <p className="text-ink-soft">
          Tilmelding kan åbnes, når medlemskabet er klar – se punkterne under “Medlemskab” herunder.
        </p>
      )}
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </div>
  );
}
