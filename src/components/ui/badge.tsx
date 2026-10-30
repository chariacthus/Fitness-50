import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-ink border-line",
  brand: "bg-brand-soft text-brand-strong border-brand-line",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-sm font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Count bubble for unread items. Always paired with a readable label for screen readers. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-sm font-bold text-white">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">
        {count} {label}
      </span>
    </span>
  );
}
