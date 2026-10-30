"use client";

import { useActionState, useEffect, useRef } from "react";
import { TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendContactMessage } from "./actions";
import { HONEYPOT_FIELD, initialContactState } from "./schema";

export function ContactForm() {
  const [state, formAction] = useActionState(sendContactMessage, initialContactState);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state.ok ? undefined : state.fieldErrors;
  const values = state.values;

  // Move keyboard/screen reader focus to the first field with an error.
  useEffect(() => {
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [fieldErrors]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      <TextField
        name="name"
        label="Navn"
        autoComplete="name"
        required
        maxLength={120}
        defaultValue={values?.name}
        error={fieldErrors?.name}
      />
      <TextField
        name="email"
        type="email"
        label="E-mail"
        autoComplete="email"
        inputMode="email"
        required
        maxLength={200}
        defaultValue={values?.email}
        error={fieldErrors?.email}
        hint="Vi bruger kun din e-mail til at svare dig."
      />
      <TextField
        name="phone"
        type="tel"
        label="Telefon"
        optional
        autoComplete="tel"
        inputMode="tel"
        maxLength={40}
        defaultValue={values?.phone}
        error={fieldErrors?.phone}
      />
      <TextareaField
        name="message"
        label="Besked"
        rows={7}
        required
        maxLength={5000}
        defaultValue={values?.message}
        error={fieldErrors?.message}
        hint="Skriv helst ikke helbredsoplysninger her. Dem kan du dele sikkert, når du er blevet medlem."
      />

      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>Lad dette felt være tomt</label>
        <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div aria-live="polite">
        <FormMessage state={state} successTitle="Beskeden er sendt" />
      </div>

      <SubmitButton size="lg" pendingText="Sender…">
        Send besked
      </SubmitButton>
    </form>
  );
}
