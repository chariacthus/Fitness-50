"use client";

import { useActionState } from "react";
import { fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { TextareaField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { rejectRequest } from "./actions";

/** "Afvis" with a short reason, which is saved on the request. */
export function RejectRequestForm({ id }: { id: string }) {
  const [state, action] = useActionState(rejectRequest, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <TextareaField
        id={`reject-note-${id}`}
        name="note"
        label="Begrundelse for afvisning"
        rows={2}
        maxLength={1000}
        hint="Fx at anmodningen ikke kom fra medlemmet selv."
        defaultValue={fieldValue(state, "note", "")}
        error={fieldError(state, "note")}
      />
      <SubmitButton variant="secondary" size="sm" pendingText="Afviser…">
        Afvis
      </SubmitButton>
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
