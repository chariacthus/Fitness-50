import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Container } from "@/components/ui/layout";
import { InlinePlaceholder } from "@/components/public/placeholder-text";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Short inline marker for text that must be filled in or confirmed. */
export function Ph({ children }: { children: ReactNode }) {
  return <InlinePlaceholder>[{children}]</InlinePlaceholder>;
}

export function LegalDraftBanner() {
  return (
    <Alert tone="warning" title="Udkast – skal gennemgås juridisk inden lancering">
      Teksten er et udkast. Oplysninger i [firkantede parenteser] skal udfyldes eller bekræftes, før siden tages i brug.
    </Alert>
  );
}

/** Legal page: title, draft banner, table of contents and numbered sections. */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="bg-canvas py-14 sm:py-20">
      <Container size="narrow">
        <article className="space-y-8">
          <header className="space-y-5">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
            <LegalDraftBanner />
            <div className="space-y-4 text-xl text-ink-soft">{intro}</div>
            <p className="text-ink-soft">
              Senest opdateret: <Ph>dato – indsættes ved lancering</Ph>
            </p>
          </header>

          <nav aria-labelledby="indhold-titel" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h2 id="indhold-titel" className="text-xl font-semibold">
              Indhold
            </h2>
            <ol className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-4 hover:underline"
                  >
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="prose-text text-lg">
            {sections.map((s, i) => (
              <section key={s.id} aria-labelledby={s.id}>
                <h2 id={s.id} className="scroll-mt-6">
                  {i + 1}. {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </div>
        </article>
      </Container>
    </div>
  );
}
