"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

/**
 * Button that asks for confirmation in an accessible <dialog> before
 * submitting its surrounding form (or running onConfirm).
 * Place inside a <form>: the confirm button is a real submit button.
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Ja, fortsæt",
  cancelLabel = "Fortryd",
  variant = "danger",
  triggerVariant,
  name,
  value,
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  triggerVariant?: ButtonVariant;
  name?: string;
  value?: string;
  onConfirm?: () => void;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <Button variant={triggerVariant ?? (variant === "danger" ? "secondary" : variant)} onClick={() => dialogRef.current?.showModal()} disabled={disabled}>
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50"
      >
        <div className="space-y-4 p-6">
          <h2 id={titleId} className="text-2xl font-semibold">
            {title}
          </h2>
          {description ? <div className="text-ink-soft">{description}</div> : null}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              {cancelLabel}
            </Button>
            <Button
              type={onConfirm ? "button" : "submit"}
              variant={variant}
              name={name}
              value={value}
              onClick={() => {
                onConfirm?.();
                dialogRef.current?.close();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
