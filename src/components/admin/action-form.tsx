"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/admin/forms";
import { CheckboxField, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/components/ui/cn";

// A small progressive-enhancement form around one server action. Server
// components compose it with the field components below, which read their
// error message and (after a failed attempt) the submitted value from the
// form's state – so every sub-form shows real outcomes without its own
// client component.

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

type Ctx = { state: FormState; prefix: string };
const FormContext = createContext<Ctx | null>(null);

function useFormContext(): Ctx {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("Feltet skal ligge i en <ActionForm>.");
  return ctx;
}

function fieldError(ctx: Ctx, name: string) {
  return ctx.state.ok ? undefined : ctx.state.fieldErrors?.[name];
}

function submittedValue(ctx: Ctx, name: string) {
  return ctx.state.ok ? undefined : ctx.state.values?.[name];
}

/** Polite live text while the form is being sent (also covers ConfirmButton submits). */
function PendingNotice({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <p aria-live="polite" className={cn("text-ink-soft", !pending && "sr-only")}>
      {pending ? text : ""}
    </p>
  );
}

export function ActionForm({
  action,
  hidden,
  children,
  className,
  successTitle,
  pendingText = "Arbejder…",
  "aria-label": ariaLabel,
}: {
  action: FormAction;
  /** Hidden inputs, e.g. the id of the record the form changes. */
  hidden?: Record<string, string>;
  children: ReactNode;
  className?: string;
  successTitle?: string;
  pendingText?: string;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [state]);

  return (
    <FormContext.Provider value={{ state, prefix }}>
      <form ref={formRef} action={formAction} className={cn("space-y-4", className)} aria-label={ariaLabel}>
        {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
        {children}
        <PendingNotice text={pendingText} />
        <FormMessage state={state} successTitle={successTitle} />
      </form>
    </FormContext.Provider>
  );
}

type WithName<P> = Omit<P, "id" | "error"> & { name: string };

export function FormTextField({ name, defaultValue, ...props }: WithName<ComponentProps<typeof TextField>>) {
  const ctx = useFormContext();
  return (
    <TextField
      {...props}
      id={`${ctx.prefix}-${name}`}
      name={name}
      error={fieldError(ctx, name)}
      defaultValue={submittedValue(ctx, name) ?? defaultValue}
    />
  );
}

export function FormTextarea({ name, defaultValue, ...props }: WithName<ComponentProps<typeof TextareaField>>) {
  const ctx = useFormContext();
  return (
    <TextareaField
      {...props}
      id={`${ctx.prefix}-${name}`}
      name={name}
      error={fieldError(ctx, name)}
      defaultValue={submittedValue(ctx, name) ?? defaultValue}
    />
  );
}

export function FormSelect({ name, defaultValue, ...props }: WithName<ComponentProps<typeof SelectField>>) {
  const ctx = useFormContext();
  return (
    <SelectField
      {...props}
      id={`${ctx.prefix}-${name}`}
      name={name}
      error={fieldError(ctx, name)}
      defaultValue={submittedValue(ctx, name) ?? defaultValue}
    />
  );
}

export function FormCheckbox({ name, defaultChecked, ...props }: WithName<ComponentProps<typeof CheckboxField>>) {
  const ctx = useFormContext();
  const submitted = submittedValue(ctx, name);
  return (
    <CheckboxField
      {...props}
      id={`${ctx.prefix}-${name}`}
      name={name}
      error={fieldError(ctx, name)}
      defaultChecked={submitted !== undefined ? submitted === "on" : defaultChecked}
    />
  );
}

/** Error text for a field that is not a plain input (e.g. a hidden id). */
export function FormFieldError({ name }: { name: string }) {
  const ctx = useFormContext();
  const error = fieldError(ctx, name);
  return error ? <p className="font-semibold text-danger">{error}</p> : null;
}
