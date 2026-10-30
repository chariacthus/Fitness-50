import type { ReactNode } from "react";

export type FaqEntry = { id: string; question: string; answer: ReactNode };

/**
 * Questions as native <details>/<summary>: keyboard and screen reader
 * friendly without JavaScript. The whole question row is the tap target.
 */
export function FaqList({ items }: { items: FaqEntry[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.id} id={`spm-${item.id}`} className="group scroll-mt-6">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-xl font-semibold hover:text-brand [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-2xl leading-none text-brand"
            >
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <div className="max-w-prose space-y-3 pb-6 text-lg text-ink">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
