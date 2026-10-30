import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/components/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse" | "inverseOutline";
export type ButtonSize = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 text-center leading-tight";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong active:bg-brand-strong",
  secondary: "border-2 border-brand bg-surface text-brand hover:bg-brand-soft",
  ghost: "text-ink hover:bg-muted underline-offset-4",
  danger: "bg-danger text-white hover:bg-[color-mix(in_srgb,var(--color-danger)_85%,black)]",
  // For dark (night) sections.
  inverse: "bg-on-night text-ink hover:bg-white",
  inverseOutline: "border-2 border-on-night/70 text-on-night hover:bg-white/10",
};

// All sizes keep at least a 44px touch target; md/lg are 48px+.
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-base",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-7 text-lg",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
