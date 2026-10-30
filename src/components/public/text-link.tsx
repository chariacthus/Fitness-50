import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/components/ui/cn";

/** Inline text link with a clear underline (not colour alone). */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn("font-semibold text-brand underline underline-offset-4 hover:text-brand-strong", className)} {...props} />;
}

/** Stand-alone "read more" link with a large touch target and an arrow. */
export function MoreLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-12 items-center gap-2 text-lg font-semibold text-brand underline-offset-4 hover:underline",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M7.3 4.3a1 1 0 011.4 0l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.4-1.4L11.6 10 7.3 5.7a1 1 0 010-1.4z" />
      </svg>
    </Link>
  );
}
