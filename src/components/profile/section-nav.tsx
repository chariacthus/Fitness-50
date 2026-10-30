import type { ReactNode } from "react";

/** In-page links to the sections of Min profil. Plain anchors – works without JavaScript. */
export function ProfileSectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  return (
    <nav aria-label="På denne side" className="mb-10">
      <ul className="flex flex-wrap gap-3">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-flex min-h-12 items-center rounded-md border-2 border-line bg-surface px-5 text-lg font-semibold text-ink hover:border-brand"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One titled section of Min profil, reachable from the section links. */
export function ProfileSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titel`} className="scroll-mt-24 space-y-6">
      <div className="space-y-2">
        <h2 id={`${id}-titel`} className="text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-lg text-ink-soft">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
