// Decorative line illustrations for the public pages. Always paired with a
// visible text heading, so they are hidden from assistive technology.
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

function Svg({ children, className, viewBox = "0 0 24 24", strokeWidth = 1.8 }: { children: ReactNode; className?: string; viewBox?: string; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={viewBox}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export type BenefitIconName = "plan" | "community" | "message" | "video" | "news" | "progress" | "shield" | "calendar" | "person";

const BENEFIT_PATHS: Record<BenefitIconName, ReactNode> = {
  plan: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5V2.5h6v1M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </>
  ),
  community: (
    <>
      <circle cx="8" cy="8.5" r="3" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M2.5 19c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5M14 14.6c.8-.4 1.6-.6 2.5-.6 2.2 0 4 1.5 4.5 4.5" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4V5zM8 9.5h8M8 12.5h5" />,
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  news: (
    <>
      <path d="M3 11v2.5a1 1 0 001 1h2.5l6 4V5.5l-6 4H4a1 1 0 00-1 1z" />
      <path d="M16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11" />
    </>
  ),
  progress: <path d="M3.5 18.5l5-5 3.5 3.5 8-8M15 9h5v5" />,
  shield: <path d="M12 3l7 3v5.5c0 4.3-3 7.8-7 9-4-1.2-7-4.7-7-9V6l7-3zM8.8 12l2.2 2.2 4.3-4.4" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h2M14 13.5h2M8 16.5h2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20c.8-4 3.6-6.5 7-6.5s6.2 2.5 7 6.5" />
    </>
  ),
};

/** Icon in a soft olive circle. */
export function BenefitIcon({ name, className }: { name: BenefitIconName; className?: string }) {
  return (
    <span className={cn("inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-line", className)}>
      <Svg className="h-7 w-7">{BENEFIT_PATHS[name]}</Svg>
    </span>
  );
}

/** Larger scene illustrations for "where you train" and the nutrition plan. */
export function PlaceIllustration({ name, className }: { name: "home" | "gym" | "outdoors" | "nutrition"; className?: string }) {
  const scenes: Record<typeof name, ReactNode> = {
    home: (
      <>
        <path d="M30 92h140" />
        <path d="M48 92V52l52-30 52 30v40" />
        <path d="M86 92V66h28v26" />
        <rect x="58" y="58" width="16" height="14" rx="2" />
        <rect x="126" y="58" width="16" height="14" rx="2" />
        <path d="M150 92v-8m-6 0h12" />
        <path d="M34 86h18M38 86v-6m10 6v-6" />
      </>
    ),
    gym: (
      <>
        <path d="M30 92h140" />
        <path d="M56 60h88" strokeWidth={4} />
        <rect x="42" y="46" width="10" height="28" rx="2" />
        <rect x="32" y="50" width="8" height="20" rx="2" />
        <rect x="148" y="46" width="10" height="28" rx="2" />
        <rect x="160" y="50" width="8" height="20" rx="2" />
        <path d="M70 92V78a8 8 0 018-8h44a8 8 0 018 8v14" />
      </>
    ),
    outdoors: (
      <>
        <path d="M24 92h152" />
        <path d="M24 92l38-44 22 24 30-40 62 60" />
        <path d="M100 92c6-10 14-14 24-16s18-8 22-16" strokeDasharray="4 5" />
        <circle cx="150" cy="30" r="9" />
        <path d="M44 92v-10m-6 4l6-8 6 8" />
      </>
    ),
    nutrition: (
      <>
        <path d="M40 62h120c0 24-26 36-60 36S40 86 40 62z" />
        <path d="M60 62c2-12 12-20 22-18M96 62c0-14 10-22 22-20M128 62c2-8 8-12 14-11" />
        <path d="M100 30c-6 6-6 12 0 18M116 26c-6 6-6 12 0 18M84 26c-6 6-6 12 0 18" strokeDasharray="3 4" />
      </>
    ),
  };
  return (
    <Svg viewBox="0 0 200 110" className={cn("h-auto w-full text-brand", className)} strokeWidth={2.4}>
      {scenes[name]}
    </Svg>
  );
}
