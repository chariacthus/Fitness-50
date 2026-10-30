"use client";

// Promotional film for Stærk50 (development only).
// Every frame is a pure function of the time `t`, so the film can be played
// live in the browser or rendered frame by frame to video
// (scripts/record-promo.mjs). Screens use the real design system with
// clearly labelled sample data.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Contours } from "@/components/ui/decor";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { CoachBadge } from "@/components/ui/coach-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { BenefitIcon } from "@/components/public/illustrations";
import { CheckIcon } from "@/components/public/feature-list";
import { BellIcon, CommunityIcon, HomeIcon, MessageIcon, ProfileIcon, TrainingIcon } from "@/components/icons";

const W = 1920;
const H = 1080;
const COACH = "Christian";
const BADGE = "Christian · Træner";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const prog = (t: number, start: number, dur: number) => clamp((t - start) / dur);
const appear = (t: number, at: number, dur = 0.6, dist = 24): CSSProperties => {
  const p = easeOut(prog(t, at, dur));
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)`, filter: p < 1 ? `blur(${(1 - p) * 5}px)` : undefined };
};
const typed = (text: string, t: number, at: number, cps = 16) => text.slice(0, Math.max(0, Math.floor((t - at) * cps)));
const caret = (t: number) => (Math.floor(t * 2.2) % 2 === 0 ? "|" : " ");

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Button styled with the real UI kit, with a deterministic press + ripple. */
function FilmButton({
  children,
  t,
  pressAt,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  t: number;
  pressAt?: number;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const pressing = pressAt !== undefined && t >= pressAt && t < pressAt + 0.16;
  const ripple = pressAt !== undefined ? prog(t, pressAt, 0.7) : 0;
  const glow = pressAt !== undefined ? 1 - Math.abs(prog(t, pressAt - 0.6, 0.6) - 1) : 0;
  return (
    <span
      className={cn(buttonClasses(variant, size), className)}
      style={{
        transform: pressing ? "scale(0.95)" : `translateY(${-2 * glow}px)`,
        boxShadow: glow > 0 && !pressing ? `0 12px 24px -14px rgb(15 18 13 / ${0.6 * glow})` : undefined,
      }}
    >
      {ripple > 0 && ripple < 1 ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] rounded-full bg-current"
          style={{ transform: `translate(-50%, -50%) scale(${easeOut(ripple)})`, opacity: 0.25 * (1 - ripple) }}
        />
      ) : null}
      {children}
    </span>
  );
}

function BrowserFrame({ url, children, t }: { url: string; children: ReactNode; t: number }) {
  return (
    <div
      className="relative h-[760px] w-[1140px] overflow-hidden rounded-2xl bg-surface shadow-[0_40px_90px_-30px_rgba(15,18,13,0.55)] ring-1 ring-black/10"
      style={appear(t, 0.1, 0.8, 40)}
    >
      <div className="flex h-14 items-center gap-3 border-b border-line bg-muted px-5">
        <span className="h-3.5 w-3.5 rounded-full bg-[#e36b5d]" />
        <span className="h-3.5 w-3.5 rounded-full bg-[#e9b949]" />
        <span className="h-3.5 w-3.5 rounded-full bg-[#5fb86b]" />
        <span className="ml-6 flex h-9 flex-1 items-center rounded-md bg-surface px-4 text-base text-ink-soft ring-1 ring-line">
          🔒&nbsp;&nbsp;{url}
        </span>
      </div>
      <div className="relative h-[704px] overflow-hidden bg-canvas">{children}</div>
    </div>
  );
}

const MEMBER_NAV = [
  { key: "hjem", label: "Hjem", Icon: HomeIcon },
  { key: "faellesskab", label: "Fællesskab", Icon: CommunityIcon },
  { key: "beskeder", label: "Beskeder", Icon: MessageIcon },
  { key: "traening", label: "Min træning", Icon: TrainingIcon },
  { key: "profil", label: "Min profil", Icon: ProfileIcon },
] as const;

function MemberChrome({ active, children, badges }: { active?: string; children: ReactNode; badges?: Partial<Record<string, number>> }) {
  return (
    <div className="flex h-full">
      <aside className="w-[230px] shrink-0 border-r border-line bg-surface px-3 py-5">
        <p className="mb-6 px-3 font-display text-2xl">
          Stærk<span className="text-brand">50</span>
        </p>
        <nav className="space-y-1">
          {MEMBER_NAV.map(({ key, label, Icon }) => (
            <span
              key={key}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-semibold",
                active === key ? "bg-brand text-white" : "text-ink",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1">{label}</span>
              {badges?.[key] ? (
                <span className="rounded-full bg-danger px-2 text-sm font-bold text-white">{badges[key]}</span>
              ) : null}
            </span>
          ))}
          <span className="flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-semibold text-ink">
            <BellIcon className="h-5 w-5" />
            Notifikationer
          </span>
        </nav>
      </aside>
      <div className="relative min-w-0 flex-1 overflow-hidden px-9 py-8">{children}</div>
    </div>
  );
}

const ADMIN_NAV = ["Overblik", "Medlemmer", "Onboarding", "Beskeder", "Træningsplaner", "Kostplaner", "Opslag", "Indstillinger"];

function AdminChrome({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="flex h-full">
      <aside className="w-[230px] shrink-0 border-r border-line bg-surface px-3 py-5">
        <p className="px-3 font-display text-2xl">
          Stærk<span className="text-brand">50</span>
        </p>
        <p className="mb-5 px-3 text-xs font-bold uppercase tracking-widest text-ink-soft">Administration</p>
        <nav className="space-y-1">
          {ADMIN_NAV.map((label) => (
            <span
              key={label}
              className={cn("flex min-h-10 items-center rounded-md px-3 text-base font-semibold", active === label ? "bg-brand text-white" : "text-ink")}
            >
              {label}
            </span>
          ))}
        </nav>
      </aside>
      <div className="relative min-w-0 flex-1 overflow-hidden px-9 py-8">{children}</div>
    </div>
  );
}

/** Notification that slides in from the top right of a screen. */
function Toast({ t, at, until, title, text }: { t: number; at: number; until: number; title: string; text?: string }) {
  const pIn = easeOut(prog(t, at, 0.5));
  const pOut = easeInOut(prog(t, until, 0.4));
  const p = pIn * (1 - pOut);
  if (p <= 0) return null;
  return (
    <div
      className="absolute right-6 top-6 z-20 flex w-[380px] items-start gap-3 rounded-xl bg-surface p-4 shadow-[0_20px_40px_-18px_rgba(15,18,13,0.5)] ring-1 ring-line"
      style={{ opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <BellIcon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        {text ? <span className="block text-ink-soft">{text}</span> : null}
      </span>
    </div>
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2",
        checked ? "border-brand bg-brand text-white" : "border-line-strong bg-surface",
      )}
    >
      {checked ? <CheckIcon className="h-5 w-5" /> : null}
    </span>
  );
}

function Choice({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-lg font-medium",
        checked ? "border-brand bg-brand-soft" : "border-line bg-surface",
      )}
    >
      <Check checked={checked} />
      {label}
    </span>
  );
}

function FakeInput({ label, value, focused, t }: { label: string; value: string; focused?: boolean; t: number }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{label}</p>
      <div
        className={cn(
          "flex h-14 items-center rounded-md border-2 bg-surface px-4 text-lg",
          focused ? "border-focus ring-2 ring-focus/20" : "border-line-strong",
        )}
      >
        {value}
        {focused ? <span className="text-ink-soft">{caret(t)}</span> : null}
      </div>
    </div>
  );
}

function Bubble({ own, name, coach, time, children, style }: { own?: boolean; name: string; coach?: boolean; time: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn("flex gap-3", own && "flex-row-reverse")} style={style}>
      <Avatar name={name} size="sm" />
      <div className={cn("max-w-[560px] space-y-1", own && "items-end text-right")}>
        <p className="flex items-center gap-2 text-base">
          <span className="font-semibold">{name}</span>
          {coach ? <CoachBadge label={BADGE} /> : null}
          <span className="text-ink-soft">{time}</span>
        </p>
        <p className={cn("inline-block rounded-2xl px-4 py-3 text-left text-lg", own ? "bg-brand-soft" : "bg-surface ring-1 ring-line")}>{children}</p>
      </div>
    </div>
  );
}

function Composer({ value, focused, t, pressAt }: { value: string; focused: boolean; t: number; pressAt: number }) {
  return (
    <div className="absolute inset-x-9 bottom-6 flex items-end gap-3">
      <div className={cn("flex min-h-14 flex-1 items-center rounded-md border-2 bg-surface px-4 text-lg", focused ? "border-focus" : "border-line-strong")}>
        {value ? value : <span className="text-ink-soft">Skriv en besked…</span>}
        {focused ? <span className="text-ink-soft">{caret(t)}</span> : null}
      </div>
      <FilmButton t={t} pressAt={pressAt} size="md" className="min-h-14 px-7">
        Send
      </FilmButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

type Scene = {
  key: string;
  dur: number;
  caption?: { title: string; text: string };
  demo?: boolean;
  render: (t: number) => ReactNode;
};

const SCENES: Scene[] = [
  {
    key: "intro",
    dur: 5,
    render: (t) => (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-night text-center text-on-night">
        <div className="absolute inset-0" style={{ transform: `scale(${1 + t * 0.03})` }}>
          <Contours className="text-on-night/10" />
        </div>
        <p className="relative font-display text-[200px] leading-none" style={appear(t, 0.2, 0.9, 40)}>
          Stærk<span className="text-accent-light">50</span>
        </p>
        <p className="relative mt-10 font-display text-6xl" style={appear(t, 1.1)}>
          Mere styrke. Mere overskud. Sammen.
        </p>
        <p className="relative mt-10 text-3xl text-on-night-soft" style={appear(t, 1.9)}>
          Personlig træning og fællesskab for mænd over 50
        </p>
      </div>
    ),
  },
  {
    key: "forside",
    dur: 8,
    caption: { title: "Overskueligt fra første klik", text: "Store knapper og tydelig tekst – lavet til mænd over 50." },
    render: (t) => {
      const scroll = easeInOut(prog(t, 1.6, 5.6)) * 2050;
      return (
        <BrowserFrame url="staerk50.dk" t={t}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local capture of the real homepage */}
          <img src="/promo/forside.png" alt="" className="w-full" style={{ transform: `translateY(${-scroll}px)` }} />
        </BrowserFrame>
      );
    },
  },
  {
    key: "konto",
    dur: 8,
    caption: { title: "Kom i gang på få minutter", text: "Opret en konto med navn, e-mail og adgangskode. Det er det hele." },
    demo: true,
    render: (t) => {
      const name = typed("Henrik Jensen", t, 0.9, 14);
      const email = typed("henrik@eksempel.dk", t, 2.2, 16);
      const pw = "•".repeat(Math.min(10, Math.max(0, Math.floor((t - 3.6) * 14))));
      const done = t >= 6;
      return (
        <BrowserFrame url="staerk50.dk/opret-konto" t={t}>
          <div className="mx-auto max-w-[600px] py-10">
            {!done ? (
              <div className="space-y-5">
                <h3 className="font-display text-5xl">Opret konto</h3>
                <FakeInput label="Fulde navn" value={name} focused={t > 0.8 && t < 2.1} t={t} />
                <FakeInput label="E-mail" value={email} focused={t >= 2.1 && t < 3.5} t={t} />
                <FakeInput label="Adgangskode" value={pw} focused={t >= 3.5 && t < 4.6} t={t} />
                <div className="flex items-center gap-3 py-1 text-lg">
                  <Check checked={t > 4.8} />
                  Jeg accepterer handelsbetingelserne og har læst privatlivspolitikken.
                </div>
                <FilmButton t={t} pressAt={5.4} size="lg" className="w-full">
                  Opret konto
                </FilmButton>
              </div>
            ) : (
              <div className="space-y-6 pt-16 text-center" style={appear(t, 6, 0.6)}>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon className="h-10 w-10" />
                </span>
                <h3 className="font-display text-5xl">Tjek din e-mail</h3>
                <p className="text-xl text-ink-soft">Vi har sendt et link til henrik@eksempel.dk. Klik på linket for at bekræfte din konto.</p>
              </div>
            )}
          </div>
        </BrowserFrame>
      );
    },
  },
  {
    key: "betaling",
    dur: 8,
    caption: { title: "Sikker betaling", text: "Betal med kort. Medlemskabet bliver aktivt, så snart betalingen er bekræftet." },
    demo: true,
    render: (t) => {
      const phase = t < 3 ? "kort" : t < 4.6 ? "betal" : t < 5.6 ? "venter" : "klar";
      return (
        <BrowserFrame url={phase === "kort" ? "staerk50.dk/bliv-medlem" : "staerk50.dk/bliv-medlem/bekraeftelse"} t={t}>
          <div className="mx-auto max-w-[680px] py-10">
            {phase === "kort" || phase === "betal" ? (
              <div className="space-y-6 rounded-2xl bg-surface p-8 ring-2 ring-brand">
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-4xl">Stærk50 medlemskab</h3>
                  <Badge tone="brand">Månedligt</Badge>
                </div>
                <ul className="space-y-2 text-lg">
                  {["Personlig træningsplan fra Christian", "Fællesskab og private beskeder", "Træningsvideoer og opslag"].map((x) => (
                    <li key={x} className="flex gap-3">
                      <CheckIcon className="text-brand" />
                      {x}
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line pt-4 font-semibold">Fornyes automatisk hver måned. Opsig når som helst.</p>
                {phase === "kort" ? (
                  <>
                    <div className="flex items-center gap-3 text-lg">
                      <Check checked={t > 1.1} />
                      Jeg ønsker, at medlemskabet starter med det samme.
                    </div>
                    <FilmButton t={t} pressAt={2.2} size="lg" className="w-full">
                      Gå til sikker betaling
                    </FilmButton>
                  </>
                ) : (
                  <div className="space-y-4" style={appear(t, 3, 0.5)}>
                    <FakeInput label="Kortnummer" value={typed("4242 4242 4242 4242", t, 3.1, 22)} focused={t < 4} t={t} />
                    <FilmButton t={t} pressAt={4.1} size="lg" className="w-full">
                      Betal og bliv medlem
                    </FilmButton>
                  </div>
                )}
              </div>
            ) : phase === "venter" ? (
              <div className="space-y-6 pt-24 text-center" style={appear(t, 4.6, 0.4)}>
                <span
                  className="mx-auto block h-16 w-16 rounded-full border-[6px] border-brand-soft border-t-brand"
                  style={{ transform: `rotate(${t * 540}deg)` }}
                />
                <p className="font-display text-4xl">Vi bekræfter din betaling…</p>
              </div>
            ) : (
              <div className="space-y-6 pt-16 text-center" style={appear(t, 5.6, 0.6)}>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon className="h-10 w-10" />
                </span>
                <h3 className="font-display text-5xl">Velkommen til Stærk50!</h3>
                <p className="text-xl text-ink-soft">Dit medlemskab er aktivt. Næste skridt er et kort spørgeskema.</p>
                <FilmButton t={t} size="lg">
                  Udfyld spørgeskemaet
                </FilmButton>
              </div>
            )}
          </div>
        </BrowserFrame>
      );
    },
  },
  {
    key: "onboarding",
    dur: 10,
    caption: { title: "Find dit niveau", text: "Et kort spørgeskema om mål, hverdag og udstyr. Christian bruger svarene til din plan." },
    demo: true,
    render: (t) => {
      const step = t < 3.6 ? 2 : t < 6.6 ? 4 : 8;
      const titles: Record<number, string> = { 2: "Dine mål", 4: "Din tid", 8: "Gennemse og send" };
      const goals = ["Blive stærkere", "Tabe mig", "Få bedre kondition", "Få mere energi", "Forbedre bevægelighed", "Komme i gang med træning igen"];
      const picked: Record<string, number> = { "Blive stærkere": 1.0, "Få mere energi": 1.6, "Komme i gang med træning igen": 2.2 };
      const sent = t >= 8.3;
      return (
        <BrowserFrame url="staerk50.dk/onboarding" t={t}>
          <MemberChrome>
            {!sent ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="font-semibold text-brand">
                    Trin {step} af 8 · {titles[step]}
                  </p>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(step / 8) * 100}%` }} />
                  </div>
                </div>
                {step === 2 ? (
                  <>
                    <h3 className="font-display text-4xl">Hvad vil du gerne opnå?</h3>
                    <p className="text-lg text-ink-soft">Vælg gerne flere.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {goals.map((g) => (
                        <Choice key={g} label={g} checked={picked[g] !== undefined && t >= picked[g]} />
                      ))}
                    </div>
                    <div className="flex justify-between pt-2">
                      <FilmButton t={t} variant="secondary">
                        Tilbage
                      </FilmButton>
                      <FilmButton t={t} pressAt={3.0}>
                        Gem og fortsæt
                      </FilmButton>
                    </div>
                  </>
                ) : step === 4 ? (
                  <div className="space-y-6" style={appear(t, 3.6, 0.5)}>
                    <h3 className="font-display text-4xl">Hvor mange dage om ugen vil du træne?</h3>
                    <div className="flex gap-3">
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <span
                          key={d}
                          className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-lg border-2 text-xl font-semibold",
                            d === 3 && t >= 4.4 ? "border-brand bg-brand text-white" : "border-line bg-surface",
                          )}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                    <h3 className="pt-2 font-display text-3xl">Hvor lang tid har du pr. træning?</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {["15–20 minutter", "Omkring 30 minutter", "Omkring 45 minutter", "Omkring 1 time"].map((m) => (
                        <Choice key={m} label={m} checked={m === "Omkring 30 minutter" && t >= 5.1} />
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <FilmButton t={t} pressAt={6.0}>
                        Gem og fortsæt
                      </FilmButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5" style={appear(t, 6.6, 0.5)}>
                    <h3 className="font-display text-4xl">Er det hele rigtigt?</h3>
                    <dl className="divide-y divide-line rounded-xl bg-surface px-6 ring-1 ring-line">
                      {[
                        ["Mål", "Blive stærkere, få mere energi, komme i gang igen"],
                        ["Træningssted", "Hjemmetræning"],
                        ["Dage om ugen", "3"],
                        ["Tid pr. træning", "Omkring 30 minutter"],
                      ].map(([k, v]) => (
                        <div key={k} className="grid grid-cols-3 gap-4 py-3 text-lg">
                          <dt className="font-semibold text-ink-soft">{k}</dt>
                          <dd className="col-span-2">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <FilmButton t={t} pressAt={7.7} size="lg">
                      Send til {COACH}
                    </FilmButton>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 pt-20 text-center" style={appear(t, 8.3, 0.6)}>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon className="h-10 w-10" />
                </span>
                <h3 className="font-display text-5xl">Tak, Henrik!</h3>
                <p className="mx-auto max-w-lg text-xl text-ink-soft">
                  {COACH} har fået dine svar og laver din personlige plan. Du får besked, når den er klar.
                </p>
              </div>
            )}
          </MemberChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "plan-editor",
    dur: 9,
    caption: { title: "Christian laver planen – personligt", text: "Ingen robot. Christian sammensætter hver plan ud fra dine svar." },
    demo: true,
    render: (t) => {
      const published = t >= 5.4;
      const rows = [
        { name: "Rejs dig fra stol", dose: "3 × 10", at: 0.9 },
        { name: "Roning med elastik", dose: "3 × 12", at: 1.7 },
        { name: "Armstrækninger mod væggen", dose: "3 × 8", at: 2.5 },
        { name: "Gåtur i rask tempo", dose: "20 min", at: 3.3 },
      ];
      return (
        <BrowserFrame url="staerk50.dk/admin/traeningsplaner" t={t}>
          <AdminChrome active="Træningsplaner">
            <div className="space-y-5">
              <div className={cn("rounded-md border-l-4 px-4 py-3 font-semibold", published ? "border-success bg-success-soft" : "border-warning bg-warning-soft")}>
                {published ? "Udgivet – synlig for Henrik" : "Kladde – ikke synlig for medlemmet endnu"}
              </div>
              <div>
                <h3 className="font-display text-4xl">Træningsplan for Henrik Jensen</h3>
                <p className="mt-1 text-lg text-ink-soft">Mål: blive stærkere og få mere energi · 3 dage om ugen · hjemme</p>
              </div>
              <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
                <p className="font-display text-2xl">Dag 1 · Hele kroppen</p>
                <ul className="mt-3 divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.name} className="flex items-center justify-between py-3 text-lg" style={appear(t, r.at, 0.45, 12)}>
                      <span className="font-medium">{r.name}</span>
                      <span className="flex items-center gap-3">
                        {r.name === "Roning med elastik" ? (
                          <span style={appear(t, 4.0, 0.4, 8)}>
                            <Badge tone="info">Video vedhæftet</Badge>
                          </span>
                        ) : null}
                        <span className="rounded bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">{r.dose}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <FilmButton t={t} variant="secondary">
                  Forhåndsvis
                </FilmButton>
                <FilmButton t={t} pressAt={4.9}>
                  Udgiv til Henrik
                </FilmButton>
              </div>
            </div>
            <Toast t={t} at={5.7} until={8.6} title="Planen er udgivet" text="Henrik har fået besked." />
          </AdminChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "min-traening",
    dur: 8,
    caption: { title: "Træn hjemme, i centeret eller udendørs", text: "Planen viser præcis, hvad du skal – med videoer og flueben, når du er færdig." },
    demo: true,
    render: (t) => {
      const done = t >= 4.0;
      const weekP = done ? 1 / 3 : 0;
      return (
        <BrowserFrame url="staerk50.dk/min-traening" t={t}>
          <MemberChrome active="traening">
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-4xl">Min træning</h3>
                <p className="mt-1 text-lg text-ink-soft">Styrke og energi · senest opdateret i dag</p>
              </div>
              <div className="rounded-xl border-l-4 border-brand bg-brand-soft px-5 py-3 text-lg">
                <span className="font-semibold">Noter fra {COACH}:</span> Tag det roligt den første uge – kvalitet før tempo.
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold">Denne uge: {done ? 1 : 0} af 3 træninger</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${weekP * 100 * easeOut(prog(t, 4.0, 0.6))}%` }} />
                </span>
              </div>
              <div className="rounded-xl bg-surface p-6 ring-1 ring-line">
                <p className="font-display text-2xl">Dag 1 · Hele kroppen</p>
                <ul className="mt-2 divide-y divide-line">
                  {[
                    ["Rejs dig fra stol", "3 × 10 · pause 60 sek."],
                    ["Roning med elastik", "3 × 12 · pause 60 sek."],
                    ["Gåtur i rask tempo", "20 minutter"],
                  ].map(([n, d]) => (
                    <li key={n} className="flex items-center justify-between py-3 text-lg">
                      <span className="font-medium">{n}</span>
                      <span className="text-ink-soft">{d}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex flex-1 items-center gap-4 rounded-lg bg-night px-4 py-3 text-on-night">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-on-night text-night">▶</span>
                    <span className="text-lg">Se video: Roning med elastik</span>
                  </div>
                  {done ? (
                    <span className="inline-flex min-h-12 items-center gap-2 rounded-md bg-success-soft px-5 text-lg font-semibold text-success" style={appear(t, 4.0, 0.4, 6)}>
                      <CheckIcon /> Gennemført i dag
                    </span>
                  ) : (
                    <FilmButton t={t} pressAt={3.6}>
                      Markér som gennemført
                    </FilmButton>
                  )}
                </div>
              </div>
            </div>
            <Toast t={t} at={0.5} until={2.8} title="Din træningsplan er klar" text={`${COACH} har lavet din plan.`} />
          </MemberChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "beskeder",
    dur: 8.5,
    caption: { title: `Skriv direkte med ${COACH}`, text: "Spørgsmål undervejs? Skriv privat – og få svar fra Christian selv." },
    demo: true,
    render: (t) => {
      const msg = "Hej Christian – mit knæ driller lidt ved squats. Hvad gør jeg?";
      const sent = t >= 3.3;
      return (
        <BrowserFrame url="staerk50.dk/beskeder" t={t}>
          <MemberChrome active="beskeder">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <Avatar name={COACH} size="md" />
              <span className="text-xl font-semibold">{COACH}</span>
              <CoachBadge label={BADGE} />
            </div>
            <div className="space-y-5 pt-6">
              <Bubble name={COACH} coach time="i går kl. 18.12">
                Velkommen, Henrik! Skriv endelig, hvis noget driller.
              </Bubble>
              {sent ? (
                <Bubble own name="Henrik Jensen" time="i dag kl. 09.41" style={appear(t, 3.3, 0.4, 12)}>
                  {msg}
                </Bubble>
              ) : null}
              {t >= 5.2 ? (
                <Bubble name={COACH} coach time="i dag kl. 09.52" style={appear(t, 5.2, 0.5, 12)}>
                  Godt, du siger det. Jeg har byttet squats ud med “rejs dig fra stol” i din plan – prøv det i morgen og fortæl, hvordan det går.
                </Bubble>
              ) : null}
            </div>
            <Composer value={sent ? "" : typed(msg, t, 0.7, 26)} focused={!sent && t > 0.6} t={t} pressAt={3.1} />
          </MemberChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "opslag",
    dur: 8,
    caption: { title: "Mød op og træn sammen", text: "Christian deler nyt, træningsvideoer og steder, hvor I kan mødes og træne." },
    demo: true,
    render: (t) => (
      <BrowserFrame url="staerk50.dk/opslag" t={t}>
        <MemberChrome active="hjem">
          <div className="space-y-5">
            <div className="flex items-center gap-3" style={appear(t, 0.9, 0.5)}>
              <Badge tone="brand">Fastgjort</Badge>
              <span className="text-ink-soft">Udgivet 30. oktober 2026 af {COACH}</span>
            </div>
            <h3 className="font-display text-5xl leading-tight" style={appear(t, 1.1, 0.5)}>
              Fælles træning lørdag kl. 9.00
            </h3>
            <p className="max-w-2xl text-xl text-ink-soft" style={appear(t, 1.4, 0.5)}>
              Vi mødes i parken og tager en rolig runde med gåtur og øvelser på bænken. Alle niveauer er velkomne – tag gode sko på.
            </p>
            <div className="flex items-start gap-4 rounded-xl bg-surface p-5 ring-1 ring-line" style={appear(t, 2.0, 0.5)}>
              <BenefitIcon name="calendar" />
              <div>
                <p className="text-lg font-semibold">Fælledparken, ved indgangen fra Øster Allé</p>
                <p className="font-semibold text-brand underline underline-offset-4">Åbn kort (åbner i nyt vindue)</p>
              </div>
            </div>
            <div className="flex h-[200px] items-center gap-6 rounded-xl bg-night px-8 text-on-night" style={appear(t, 2.7, 0.6)}>
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-on-night text-3xl text-night">▶</span>
              <span>
                <span className="block font-display text-3xl">Træningsvideo: Roning med elastik</span>
                <span className="block text-lg text-on-night-soft">Sådan holder du ryggen rank – 2 minutter</span>
              </span>
            </div>
          </div>
          <Toast t={t} at={0.3} until={3.6} title={`Nyt opslag fra ${COACH}`} text="Fælles træning lørdag kl. 9.00" />
        </MemberChrome>
      </BrowserFrame>
    ),
  },
  {
    key: "faellesskab",
    dur: 9,
    caption: { title: "Et fællesskab, der holder dig i gang", text: "Del erfaringer, stil spørgsmål og fejr de små sejre – kun for medlemmer." },
    demo: true,
    render: (t) => {
      const reply = "Jeg er med! Ses lørdag.";
      const sent = t >= 5.7;
      return (
        <BrowserFrame url="staerk50.dk/faellesskab" t={t}>
          <MemberChrome active="faellesskab" badges={{ faellesskab: sent ? 0 : 3 }}>
            <h3 className="font-display text-4xl">Fællesskab</h3>
            <div className="absolute inset-x-9 top-[100px] bottom-[110px] overflow-hidden">
            <div
              className="space-y-5 pt-5"
              style={{ transform: `translateY(${-(easeOut(prog(t, 5.7, 0.5)) * 120 + easeOut(prog(t, 7.0, 0.5)) * 125)}px)` }}
            >
              <div className="rounded-xl border border-brand-line bg-brand-soft px-5 py-3" style={appear(t, 0.4, 0.5)}>
                <p className="flex items-center gap-2 text-base">
                  <span className="font-semibold">{COACH}</span>
                  <CoachBadge label={BADGE} />
                </p>
                <p className="text-lg">Velkommen til fællesskabet, Henrik! Her deler vi erfaringer, spørgsmål og små sejre.</p>
              </div>
              <Bubble name="Peter Holm" time="i dag kl. 07.15" style={appear(t, 1.0, 0.5, 12)}>
                Første uge klaret – tre træninger! Det kan mærkes i trapperne.
              </Bubble>
              <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-danger" style={appear(t, 1.5, 0.4, 4)}>
                <span className="h-px flex-1 bg-danger/40" />
                Nye beskeder
                <span className="h-px flex-1 bg-danger/40" />
              </div>
              <Bubble name="Ole Madsen" time="i dag kl. 08.02" style={appear(t, 1.8, 0.5, 12)}>
                Flot, Peter! Hvem er med i Fælledparken lørdag?
              </Bubble>
              {sent ? (
                <Bubble own name="Henrik Jensen" time="i dag kl. 09.58" style={appear(t, 5.7, 0.4, 12)}>
                  {reply}
                </Bubble>
              ) : null}
              {t >= 7.0 ? (
                <Bubble name={COACH} coach time="i dag kl. 10.03" style={appear(t, 7.0, 0.5, 12)}>
                  Dejligt – vi ses kl. 9!
                </Bubble>
              ) : null}
            </div>
            </div>
            <Composer value={sent ? "" : typed(reply, t, 3.6, 14)} focused={!sent && t > 3.4} t={t} pressAt={5.5} />
          </MemberChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "kostplan",
    dur: 8.5,
    caption: { title: "Tilkøb: personlig kostplan", text: "Vil du også have styr på kosten? Christian laver en plan, der passer til din hverdag." },
    demo: true,
    render: (t) => {
      const bought = t >= 3.2;
      return (
        <BrowserFrame url={bought ? "staerk50.dk/min-traening/kostplan" : "staerk50.dk/tilkoeb/kostplan"} t={t}>
          <MemberChrome active="traening">
            {!bought ? (
              <div className="max-w-2xl space-y-5 rounded-2xl bg-surface p-8 ring-1 ring-line">
                <Badge tone="brand">Tilkøb</Badge>
                <h3 className="font-display text-4xl">Personlig kostplan</h3>
                <p className="text-xl text-ink-soft">Christian laver en kostplan ud fra dine vaner og mål. Betales én gang.</p>
                <ul className="space-y-2 text-lg">
                  {["Måltidsidéer og en enkel struktur for dagen", "Råd, der passer til din hverdag", "Personlige noter fra Christian"].map((x) => (
                    <li key={x} className="flex gap-3">
                      <CheckIcon className="text-brand" />
                      {x}
                    </li>
                  ))}
                </ul>
                <FilmButton t={t} pressAt={2.0} size="lg">
                  Køb kostplan
                </FilmButton>
              </div>
            ) : (
              <div className="space-y-5" style={appear(t, 3.2, 0.6)}>
                <h3 className="font-display text-4xl">Din kostplan</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Morgenmad", "Havregryn med bær, nødder og skyr"],
                    ["Frokost", "Rugbrød med æg, laks og grønt"],
                    ["Eftermiddag", "Frugt og en håndfuld mandler"],
                    ["Aftensmad", "Kylling, kartofler og ovnbagte grøntsager"],
                  ].map(([k, v], i) => (
                    <div key={k} className="rounded-xl bg-surface p-5 ring-1 ring-line" style={appear(t, 3.6 + i * 0.35, 0.45, 12)}>
                      <p className="text-sm font-bold uppercase tracking-widest text-brand">{k}</p>
                      <p className="mt-1 text-lg">{v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-ink-soft" style={appear(t, 5.2, 0.5, 6)}>
                  Kostplanen er generel vejledning og ikke medicinsk kostbehandling.
                </p>
              </div>
            )}
            <Toast t={t} at={2.5} until={4.8} title="Tak for dit køb" text="Christian går i gang med din kostplan." />
          </MemberChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "overblik",
    dur: 8,
    caption: { title: "Christian har overblikket", text: "Nye medlemmer, spørgeskemaer, beskeder og opslag – samlet ét sted, uden teknik." },
    demo: true,
    render: (t) => {
      const count = (n: number, at: number) => Math.round(n * easeOut(prog(t, at, 1.2)));
      return (
        <BrowserFrame url="staerk50.dk/admin" t={t}>
          <AdminChrome active="Overblik">
            <h3 className="font-display text-4xl">Overblik</h3>
            <div className="mt-5 grid grid-cols-4 gap-4">
              {[
                ["Aktive medlemmer", 24, 0.6],
                ["Nye spørgeskemaer", 2, 0.8],
                ["Ubesvarede beskeder", 1, 1.0],
                ["Planer der venter", 1, 1.2],
              ].map(([label, n, at]) => (
                <div key={label as string} className="rounded-xl bg-surface p-5 ring-1 ring-line" style={appear(t, at as number, 0.5, 12)}>
                  <p className="font-display text-5xl">{count(n as number, at as number)}</p>
                  <p className="mt-1 text-ink-soft">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-surface p-6 ring-1 ring-line">
              <p className="font-display text-2xl">Seneste</p>
              <ul className="mt-2 divide-y divide-line">
                {[
                  ["Henrik Jensen har udfyldt sit spørgeskema", "for 5 min. siden", 2.0],
                  ["Ny besked fra Peter Holm", "for 20 min. siden", 2.4],
                  ["Ole Madsen er blevet medlem", "i går", 2.8],
                ].map(([a, b, at]) => (
                  <li key={a as string} className="flex items-center justify-between py-3 text-lg" style={appear(t, at as number, 0.45, 10)}>
                    <span className="font-medium">{a}</span>
                    <span className="text-ink-soft">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex gap-3" style={appear(t, 3.4, 0.5, 8)}>
              <FilmButton t={t} pressAt={5.6}>
                Nyt opslag
              </FilmButton>
              <FilmButton t={t} variant="secondary">
                Ny træningsplan
              </FilmButton>
            </div>
          </AdminChrome>
        </BrowserFrame>
      );
    },
  },
  {
    key: "mobil",
    dur: 7,
    caption: { title: "Virker på mobil, tablet og computer", text: "Store knapper og tydelige ord – også på den lille skærm." },
    demo: true,
    render: (t) => (
      <div
        className="relative h-[900px] w-[440px] overflow-hidden rounded-[56px] bg-[#111] p-3.5 shadow-[0_40px_90px_-30px_rgba(15,18,13,0.6)]"
        style={appear(t, 0.1, 0.9, 60)}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[44px] bg-canvas">
          <div className="flex items-center justify-between border-b border-line bg-surface px-5 pt-10 pb-3">
            <span className="font-display text-2xl">
              Stærk<span className="text-brand">50</span>
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <BellIcon className="h-5 w-5" /> Notifikationer
              <span className="rounded-full bg-danger px-1.5 text-sm text-white">1</span>
            </span>
          </div>
          <div className="flex-1 space-y-4 px-5 pt-5">
            <p className="font-display text-4xl" style={appear(t, 0.7)}>
              Hej Henrik
            </p>
            <div className="space-y-3 rounded-2xl bg-surface p-5 ring-1 ring-line" style={appear(t, 1.1)}>
              <p className="text-sm font-bold uppercase tracking-widest text-ink-soft">Næste træning</p>
              <p className="font-display text-2xl">Dag 2 · Ben og balance</p>
              <FilmButton t={t} pressAt={4.2} className="w-full">
                Gå til træningen
              </FilmButton>
            </div>
            <div className="rounded-2xl bg-brand-soft p-5 ring-1 ring-brand-line" style={appear(t, 1.6)}>
              <p className="text-sm font-bold uppercase tracking-widest text-brand">Nyt fra {COACH}</p>
              <p className="mt-1 text-lg font-semibold">Fælles træning lørdag kl. 9.00</p>
            </div>
          </div>
          <div className="grid grid-cols-5 border-t border-line bg-surface pb-6 pt-2">
            {MEMBER_NAV.map(({ key, label, Icon }) => (
              <span key={key} className={cn("flex flex-col items-center gap-0.5 text-[0.78rem] font-semibold", key === "hjem" ? "text-brand" : "text-ink-soft")}>
                <Icon className="h-6 w-6" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "outro",
    dur: 6.5,
    render: (t) => (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-night text-center text-on-night">
        <div className="absolute inset-0" style={{ transform: `scale(${1.1 - t * 0.02})` }}>
          <Contours className="text-on-night/10" />
        </div>
        <p className="relative font-display text-[180px] leading-none" style={appear(t, 0.3, 0.9, 40)}>
          Stærk<span className="text-accent-light">50</span>
        </p>
        <p className="relative mt-10 font-display text-6xl" style={appear(t, 1.1)}>
          Mere styrke. Mere overskud. Sammen.
        </p>
        <p className="relative mt-12 text-3xl text-on-night-soft" style={appear(t, 2.0)}>
          Bygget til {COACH} – klar til de første medlemmer.
        </p>
      </div>
    ),
  },
];

const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].dur], []);
export const FILM_DURATION = SCENES.reduce((sum, s) => sum + s.dur, 0);

function Frame({ t }: { t: number }) {
  const index = Math.max(0, STARTS.findLastIndex((start) => t >= start));
  const scene = SCENES[index];
  const lt = t - STARTS[index];
  const fadeIn = index === 0 ? 1 : easeOut(prog(lt, 0, 0.45));
  const fadeOut = index === SCENES.length - 1 ? 1 : 1 - easeInOut(prog(lt, scene.dur - 0.4, 0.4));
  const chapter = SCENES.filter((s) => s.caption).indexOf(scene);
  const chapters = SCENES.filter((s) => s.caption).length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <div className="absolute inset-0" style={{ opacity: Math.min(fadeIn, fadeOut) }}>
        {scene.caption ? (
          <div className="absolute inset-0 grid grid-cols-[640px_1fr] items-center">
            <Contours className="text-brand/10" />
            <div className="relative space-y-6 pl-[110px] pr-10">
              <p className="flex items-center gap-3 text-lg font-bold uppercase tracking-[0.16em] text-brand" style={appear(lt, 0.15)}>
                <span className="h-0.5 w-10 bg-current" />
                {String(chapter + 1).padStart(2, "0")} / {String(chapters).padStart(2, "0")}
              </p>
              <h2 className="text-[64px] leading-[1.05]" style={appear(lt, 0.3)}>
                {scene.caption.title}
              </h2>
              <p className="text-[30px] leading-snug text-ink-soft" style={appear(lt, 0.55)}>
                {scene.caption.text}
              </p>
            </div>
            <div className="relative flex items-center justify-center pr-[70px]">{scene.render(lt)}</div>
            {scene.demo ? (
              <p className="absolute bottom-8 right-12 rounded-md bg-surface/80 px-3 py-1 text-lg text-ink-soft ring-1 ring-line">
                Eksempel med testdata
              </p>
            ) : null}
          </div>
        ) : (
          scene.render(lt)
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/5">
        <div className="h-full bg-brand" style={{ width: `${(t / FILM_DURATION) * 100}%` }} />
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __setFilmTime?: (seconds: number) => void;
    __filmDuration?: number;
  }
}

/** Plays live in the browser; with ?record the recorder drives the clock frame by frame. */
export function PromoFilm({ record = false }: { record?: boolean }) {
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    window.__filmDuration = FILM_DURATION;
    window.__setFilmTime = (seconds: number) => flushSync(() => setT(seconds));
    const fit = () => setScale(record ? 1 : Math.min(window.innerWidth / W, window.innerHeight / H));
    const frame = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, [record]);

  useEffect(() => {
    if (record) return;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      setT(((now - startedAt) / 1000) % FILM_DURATION);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [record]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Film frames are pure functions of time: no CSS transitions or animations. */}
      <style>{`.film-root *, .film-root *::before, .film-root *::after { transition: none !important; animation: none !important; }`}</style>
      <div className="film-root origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <Frame t={t} />
      </div>
    </div>
  );
}
