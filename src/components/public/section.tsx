import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Container } from "@/components/ui/layout";

export type SectionTone = "canvas" | "surface";

/**
 * Full-width page section. Sections alternate between the warm canvas and a
 * white surface band with hairline borders, instead of wrapping everything
 * in cards.
 */
export function Section({
  id,
  tone = "canvas",
  labelledBy,
  size,
  className,
  children,
}: {
  id?: string;
  tone?: SectionTone;
  labelledBy?: string;
  size?: "default" | "narrow" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-6 py-16 sm:py-20", tone === "surface" ? "border-y border-line bg-surface" : "bg-canvas", className)}
    >
      <Container size={size}>{children}</Container>
    </section>
  );
}

/** Section heading with an optional short line above it and an intro below. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl space-y-4", className)}>
      {eyebrow ? <p className="text-lg font-semibold text-brand">{eyebrow}</p> : null}
      <h2 id={id} className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {children ? <div className="space-y-4 text-xl text-ink-soft">{children}</div> : null}
    </div>
  );
}

/** Top of a public sub page: the page's only <h1> and a short introduction. */
export function PageIntro({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="bg-canvas pt-14 pb-12 sm:pt-20 sm:pb-16">
      <Container>
        <div className="max-w-3xl space-y-5">
          {eyebrow ? <p className="text-lg font-semibold text-brand">{eyebrow}</p> : null}
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{title}</h1>
          {children ? <div className="space-y-4 text-xl text-ink-soft">{children}</div> : null}
          {actions ? <div className="flex flex-wrap gap-3 pt-2">{actions}</div> : null}
        </div>
      </Container>
    </div>
  );
}
