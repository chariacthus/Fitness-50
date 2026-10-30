"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { initialFormState, type FormState } from "@/lib/profile/form-state";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/components/ui/cn";

export type FormStateAction = (state: FormState, formData: FormData) => Promise<FormState>;

/** Polite live text while the form is being sent (also covers ConfirmButton submits). */
function PendingNotice({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <p aria-live="polite" className={cn("text-ink-soft", !pending && "sr-only")}>
      {pending ? text : ""}
    </p>
  );
}

/**
 * A small progressive-enhancement form around one server action: hidden
 * inputs, the buttons/fields passed as children, and the real outcome below.
 * Lets server components use SubmitButton/ConfirmButton without their own client file.
 */
export function InlineActionForm({
  action,
  hidden,
  children,
  className,
  successTitle,
  pendingText = "Arbejder…",
  "aria-label": ariaLabel,
}: {
  action: FormStateAction;
  hidden?: Record<string, string>;
  children: ReactNode;
  className?: string;
  successTitle?: string;
  pendingText?: string;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={cn("space-y-3", className)} aria-label={ariaLabel}>
      {hidden ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
      {children}
      <PendingNotice text={pendingText} />
      <div aria-live="polite">
        <FormMessage state={state} successTitle={successTitle} />
      </div>
    </form>
  );
}
