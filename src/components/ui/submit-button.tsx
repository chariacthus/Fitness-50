"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReactNode } from "react";

/** Submit button that disables itself while the form is being sent (prevents double submits). */
export function SubmitButton({
  children,
  pendingText = "Gemmer…",
  variant = "primary",
  size = "md",
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      name={name}
      value={value}
    >
      {pending ? <Spinner label={pendingText} /> : children}
    </Button>
  );
}
