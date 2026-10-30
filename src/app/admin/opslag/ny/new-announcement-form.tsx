"use client";

import { useActionState } from "react";
import { fieldError, fieldValue, initialFormState } from "@/lib/profile/form-state";
import { TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createAnnouncement } from "./actions";

export function NewAnnouncementForm() {
  const [state, action] = useActionState(createAnnouncement, initialFormState);
  return (
    <form action={action} className="space-y-6">
      <TextField
        name="title"
        label="Overskrift"
        required
        maxLength={200}
        defaultValue={fieldValue(state, "title", "")}
        error={fieldError(state, "title")}
      />
      <TextareaField
        name="body"
        label="Tekst"
        optional
        rows={8}
        maxLength={20000}
        hint="Du kan også skrive teksten senere. Lav en tom linje mellem afsnit."
        defaultValue={fieldValue(state, "body", "")}
        error={fieldError(state, "body")}
      />
      <div aria-live="polite">
        <FormMessage state={state} />
      </div>
      <SubmitButton size="lg" pendingText="Opretter kladden…">
        Opret kladde
      </SubmitButton>
    </form>
  );
}
