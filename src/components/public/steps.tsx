import type { ReactNode } from "react";

export type Step = { title: string; text: ReactNode };

/** Numbered steps, read top to bottom, with large editorial numerals. */
export function Steps({ items }: { items: Step[] }) {
  return (
    <ol role="list" className="divide-y divide-line border-y border-line">
      {items.map((item, i) => (
        <li key={item.title} className="grid grid-cols-[4rem_1fr] gap-4 py-6 sm:grid-cols-[5.5rem_1fr]">
          <span aria-hidden="true" className="font-display text-5xl leading-none text-brand sm:text-6xl">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="text-xl font-semibold sm:text-2xl">
              <span className="sr-only">Trin {i + 1}: </span>
              {item.title}
            </h3>
            <div className="mt-1 text-lg text-ink-soft">{item.text}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
