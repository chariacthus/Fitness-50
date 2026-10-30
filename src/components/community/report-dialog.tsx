"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { initialActionState, type ActionResult } from "@/lib/action-result";
import { REPORT_REASON_MAX, type ReportTarget } from "@/lib/messages/report";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/form";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

/** A server action that receives target_type, target_id and reason. */
export type ReportAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

type ReportDialogProps = {
  action: ReportAction;
  targetType: ReportTarget;
  targetId: string;
  title: string;
  /** What is being reported, e.g. a quote of the message. */
  description?: ReactNode;
  coachName: string;
  onClose: () => void;
};

/**
 * Modal "Anmeld" form. Opens as soon as it is mounted and calls onClose when
 * the dialog closes (Luk / Fortryd / Escape). The outcome shown is the real
 * result of the server action.
 */
export function ReportDialog({ action, targetType, targetId, title, description, coachName, onClose }: ReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-4 p-6">
        <h2 id={titleId} className="text-2xl font-semibold">
          {title}
        </h2>
        {state.ok ? (
          <>
            <Alert tone="success" title="Tak for din anmeldelse">
              {state.message}
            </Alert>
            <div className="flex justify-end">
              <Button onClick={close}>Luk</Button>
            </div>
          </>
        ) : (
          <form action={formAction} className="space-y-4">
            {description ? <div className="text-ink-soft">{description}</div> : null}
            <p>
              Anmeldelsen sendes til administratoren ({coachName}) og vises ikke for andre medlemmer.
            </p>
            <input type="hidden" name="target_type" value={targetType} />
            <input type="hidden" name="target_id" value={targetId} />
            <TextareaField
              id={reasonId}
              name="reason"
              label="Hvorfor anmelder du?"
              hint="Skriv kort, hvad der er galt."
              required
              minLength={3}
              maxLength={REPORT_REASON_MAX}
              rows={4}
              error={state.fieldErrors?.reason}
            />
            <div aria-live="polite">
              <FormMessage state={state} />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={close}>
                Fortryd
              </Button>
              <SubmitButton pendingText="Sender…">Send anmeldelse</SubmitButton>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

/** Stand-alone "Anmeld" button that opens a ReportDialog (used on profile pages). */
export function ReportButton({
  label,
  variant = "secondary",
  ...dialogProps
}: Omit<ReportDialogProps, "onClose"> & { label: ReactNode; variant?: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <ReportDialog {...dialogProps} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
