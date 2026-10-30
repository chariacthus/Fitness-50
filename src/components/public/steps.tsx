import type { ReactNode } from "react";

export type Step = { title: string; text: ReactNode };

/** Numbered steps, read top to bottom, with a quiet connecting line. */
export function Steps({ items }: { items: Step[] }) {
  return (
    <ol role="list" className="space-y-8">
      {items.map((item, i) => (
        <li key={item.title} className="relative flex gap-5">
          {i < items.length - 1 ? (
            <span aria-hidden="true" className="absolute top-14 -bottom-6 left-6 w-0.5 -translate-x-1/2 bg-line" />
          ) : null}
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-surface text-xl font-bold text-brand">
            <span className="sr-only">Trin </span>
            {i + 1}
          </span>
          <div className="pt-2">
            <h3 className="text-xl font-semibold">{item.title}</h3>
            <div className="mt-1 text-lg text-ink-soft">{item.text}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
