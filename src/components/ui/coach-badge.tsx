import { cn } from "@/components/ui/cn";

/**
 * The platform's own "verified coach" marker. It is NOT an external or
 * official verification – the title text says so for screen readers.
 */
export function CoachBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border border-brand-line bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand-strong",
        className,
      )}
      title="Stærk50's træner"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="currentColor">
        <path d="M10 1.5l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L10 18.5l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1L10 1.5z" />
        <path d="M8.6 12.6L6.3 10.3l1-1 1.3 1.3 4-4 1 1-5 5z" fill="white" />
      </svg>
      <span>{label}</span>
      <span className="sr-only">(platformens træner)</span>
    </span>
  );
}
