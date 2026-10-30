import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Container } from "@/components/ui/layout";

export type SectionTone = "canvas" | "surface" | "tint" | "night";

const TONES: Record<SectionTone, string> = {
  canvas: "bg-canvas",
  surface: "border-y border-line bg-surface",
  tint: "bg-brand-soft",
  night: "bg-night text-on-night",
};

/**
 * Full-width page section. Sections alternate between warm canvas, white,
 * a soft olive tint and the deep "night" tone instead of wrapping everything
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
      data-tone={tone}
      className={cn("group/section relative scroll-mt-24 overflow-hidden py-20 sm:py-28", TONES[tone], className)}
    >
      <Container size={size} className="relative">
        {children}
      </Container>
    </section>
  );
}

/** Section heading with an optional short intro below. */
export function SectionHeading({
  id,
  title,
  children,
  className,
  align = "left",
}: {
  id: string;
  title: string;
  children?: ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl space-y-5", align === "center" && "mx-auto text-center", className)}>
      <h2 id={id} className="text-4xl leading-[1.1] text-balance sm:text-5xl">
        {title}
      </h2>
      {children ? (
        <div className="space-y-4 text-xl text-ink-soft group-data-[tone=night]/section:text-on-night-soft">{children}</div>
      ) : null}
    </div>
  );
}

/** Top of a public sub page: the page's only <h1> and a short introduction. */
export function PageIntro({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-brand-soft pt-16 pb-14 sm:pt-24 sm:pb-20">
      <Container>
        <div className="max-w-3xl space-y-6">
          <h1 className="text-5xl leading-[1.05] text-balance sm:text-6xl">{title}</h1>
          {children ? <div className="space-y-4 text-xl text-ink-soft">{children}</div> : null}
          {actions ? <div className="flex flex-wrap gap-3 pt-2">{actions}</div> : null}
        </div>
      </Container>
    </div>
  );
}
