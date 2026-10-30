import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Section, type SectionTone } from "@/components/public/section";

/** Closing call to action: one primary action and one quiet alternative. */
export function CtaBand({
  id = "kom-i-gang",
  title,
  children,
  tone = "surface",
  secondary = { href: "/kontakt", label: "Stil et spørgsmål" },
}: {
  id?: string;
  title: string;
  children?: ReactNode;
  tone?: SectionTone;
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <Section tone={tone} labelledBy={id}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <h2 id={id} className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {children ? <div className="text-xl text-ink-soft">{children}</div> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/bliv-medlem" size="lg">
            Bliv medlem
          </ButtonLink>
          {secondary ? (
            <ButtonLink href={secondary.href} variant="secondary" size="lg">
              {secondary.label}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
