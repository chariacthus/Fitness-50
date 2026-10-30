import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/public/section";

/** Closing call to action on the deep night tone: one primary action and one quiet alternative. */
export function CtaBand({
  id = "kom-i-gang",
  title,
  children,
  secondary = { href: "/kontakt", label: "Stil et spørgsmål" },
}: {
  id?: string;
  title: string;
  children?: ReactNode;
  /** Kept for compatibility; the band always uses the night tone. */
  tone?: string;
  secondary?: { href: string; label: string } | null;
}) {
  return (
    <Section tone="night" labelledBy={id}>
      <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-4">
          <h2 id={id} className="text-4xl leading-[1.1] text-balance sm:text-5xl">
            {title}
          </h2>
          {children ? <div className="text-xl text-on-night-soft">{children}</div> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/bliv-medlem" size="lg" variant="inverse">
            Bliv medlem
          </ButtonLink>
          {secondary ? (
            <ButtonLink href={secondary.href} variant="inverseOutline" size="lg">
              {secondary.label}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
