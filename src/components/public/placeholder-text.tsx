import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { placeholder } from "@/lib/settings";
import { isPlaceholderText, paragraphs } from "@/components/public/copy";

/** Clearly marked block where real text from the coach is still missing. */
export function PlaceholderNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border-2 border-dashed border-line-strong bg-muted px-5 py-4 text-ink-soft", className)}>
      <p className="text-sm font-bold uppercase tracking-wide">Pladsholder</p>
      <p className="mt-1 text-lg">{children}</p>
    </div>
  );
}

/** Inline marker for a missing detail, e.g. in the legal drafts. */
export function InlinePlaceholder({ children }: { children: ReactNode }) {
  return <span className="rounded bg-warning-soft px-1 font-semibold text-warning">{children}</span>;
}

/** Shows a settings value, or an inline marked placeholder when it is missing. */
export function Fill({ value, label }: { value: string | null | undefined; label: string }) {
  if (!isPlaceholderText(value)) return <>{value}</>;
  return <InlinePlaceholder>{value?.trim() || placeholder(null, label)}</InlinePlaceholder>;
}

/**
 * Longer settings text (bio, descriptions) split into paragraphs, or a
 * marked placeholder block when the coach has not written it yet.
 */
export function SettingText({
  value,
  label,
  className,
}: {
  value: string | null | undefined;
  label: string;
  className?: string;
}) {
  if (isPlaceholderText(value)) {
    return <PlaceholderNote className={className}>{value?.trim() || placeholder(null, label)}</PlaceholderNote>;
  }
  return (
    <div className={cn("space-y-4", className)}>
      {paragraphs(value ?? "").map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
