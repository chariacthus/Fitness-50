import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Contours } from "@/components/ui/decor";

export function Container({ children, className, size = "default" }: { children: ReactNode; className?: string; size?: "default" | "narrow" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-6xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BackLink({ href, children = "Tilbage" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand underline-offset-4 hover:underline">
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M12.7 4.3a1 1 0 010 1.4L8.4 10l4.3 4.3a1 1 0 01-1.4 1.4l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 0z" />
      </svg>
      {children}
    </Link>
  );
}

/** Page title block used on every member/admin page. */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: ReactNode;
  back?: { href: string; label?: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 space-y-3">
      {back ? <BackLink href={back.href}>{back.label ?? "Tilbage"}</BackLink> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {description ? <div className="max-w-prose text-lg text-ink-soft">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Plain bordered section. Use sparingly – not every block needs a card. */
export function Panel({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("rounded-lg border border-line bg-surface p-5 sm:p-6", className)}>{children}</Tag>;
}

export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn("text-2xl font-semibold tracking-tight", className)}>
      {children}
    </h2>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="text-xl font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-prose text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Clearly marked placeholder where a real photo from Christian will go. */
export function ImagePlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Pladsholder: ${label}`}
      className={cn(
        "relative flex aspect-[4/3] w-full items-start overflow-hidden rounded-xl bg-brand-soft p-5 text-brand-strong ring-1 ring-brand-line",
        className,
      )}
    >
      <Contours className="text-brand/25" />
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-surface/80 text-brand shadow-sm">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
      </div>
      <span className="relative rounded-md bg-surface/90 px-3 py-2 text-left shadow-sm">
        <span className="block text-xs font-bold uppercase tracking-widest text-ink-soft">Pladsholder · foto kommer</span>
        <span className="block font-semibold text-ink">{label}</span>
      </span>
    </div>
  );
}

/** Key/value list (profile, membership details, admin views). */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="font-semibold text-ink-soft">{item.label}</dt>
          <dd className="sm:col-span-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
