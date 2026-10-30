import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { cn } from "@/components/ui/cn";

export type Figure = { label: string; value: number; href: string; needsAttention?: boolean };

/** Compact row of real figures; each one links to where it can be handled. */
export function FiguresRow({ figures, label }: { figures: Figure[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {figures.map((f) => {
        const highlight = Boolean(f.needsAttention && f.value > 0);
        return (
          <li key={f.label}>
            <Link
              href={f.href}
              className={cn(
                "flex h-full min-h-24 flex-col justify-between gap-1 rounded-lg border bg-surface p-4 hover:border-brand focus-visible:border-brand",
                highlight ? "border-warning border-l-4" : "border-line",
              )}
            >
              <span className="text-3xl font-bold tabular-nums">{formatNumber(f.value)}</span>
              <span className="font-semibold leading-snug text-ink-soft">{f.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
