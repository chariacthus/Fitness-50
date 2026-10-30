import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Contours } from "@/components/ui/decor";
import { getUserId } from "@/lib/auth";
import { getSiteSettings, siteAssetUrl } from "@/lib/settings";
import { CtaBand } from "@/components/public/cta-band";
import { CheckIcon } from "@/components/public/feature-list";
import { BenefitIcon, type BenefitIconName } from "@/components/public/illustrations";
import { Pricing } from "@/components/public/pricing";
import { Section, SectionHeading } from "@/components/public/section";
import { MoreLink } from "@/components/public/text-link";

export const dynamic = "force-dynamic";

/** Illustrative example of a training day in "Min træning" – captioned as an example. */
function ExampleTrainingDay() {
  const rows = [
    { name: "Rejs dig fra stol", dose: "3 × 10" },
    { name: "Roning med elastik", dose: "3 × 12" },
    { name: "Gåtur i rask tempo", dose: "20 min" },
  ];
  return (
    <figure className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] ring-1 ring-black/5">
      <figcaption className="text-xs font-bold uppercase tracking-widest text-ink-soft">Eksempel fra Min træning</figcaption>
      <p className="mt-2 font-display text-2xl">Dag 1 · Hele kroppen</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-4 py-3">
            <span className="font-medium">{row.name}</span>
            <span className="shrink-0 rounded bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">{row.dose}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 font-semibold text-brand">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
          <CheckIcon className="h-4 w-4" />
        </span>
        Markér som gennemført
      </p>
    </figure>
  );
}

/** Small example of the weekly progress shown on Hjem. */
function ExampleProgress() {
  return (
    <div aria-hidden="true" className="w-56 rounded-2xl bg-surface p-5 text-ink shadow-[0_24px_48px_-20px_rgba(0,0,0,0.5)] ring-1 ring-black/5">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">Denne uge</p>
      <p className="mt-1 font-display text-3xl">3 af 4</p>
      <div className="mt-3 flex gap-1.5">
        {[1, 1, 1, 0].map((done, i) => (
          <span key={i} className={done ? "h-2.5 flex-1 rounded-full bg-brand" : "h-2.5 flex-1 rounded-full bg-muted"} />
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-soft">træninger gennemført</p>
    </div>
  );
}

export default async function HomePage() {
  const [settings, userId] = await Promise.all([getSiteSettings(), getUserId()]);
  const coach = settings.coach_name;
  const heroImage = siteAssetUrl(settings.hero_image_path);

  const benefits: { icon: BenefitIconName; title: string; text: string }[] = [
    { icon: "plan", title: "Din egen plan", text: "Lavet til dine mål, dit niveau og din hverdag." },
    { icon: "community", title: "Et fællesskab", text: "Mænd over 50, der også er i gang." },
    { icon: "message", title: "Direkte kontakt", text: `Skriv til ${coach}, når du har spørgsmål.` },
    { icon: "video", title: "Videoer", text: "Se præcis, hvordan øvelserne laves." },
  ];

  const steps = [
    { title: "Bliv medlem", text: "Opret en konto og betal sikkert." },
    { title: "Fortæl om dig selv", text: "Et kort spørgeskema om mål og hverdag." },
    { title: "Kom i gang", text: `${coach} laver din plan – du træner.` },
  ];

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden bg-night text-on-night">
        <Contours className="text-on-night/10" />
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image from the public site bucket
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        ) : null}
        <Container className="relative grid items-center gap-16 py-20 sm:py-28 lg:grid-cols-[1.2fr_1fr] lg:py-32">
          <div className="space-y-8">
            <p className="rise flex items-center gap-3 text-sm font-bold uppercase tracking-[0.14em] text-accent-light">
              <span aria-hidden="true" className="h-0.5 w-8 bg-current" />
              Træning for mænd over 50
            </p>
            <h1 className="rise text-[2.6rem] leading-[1.05] text-balance sm:text-6xl lg:text-7xl" style={{ ["--d" as string]: "80ms" }}>
              Bliv stærkere. Få mere energi. Hold dig i gang.
            </h1>
            <p className="rise max-w-lg text-xl text-on-night-soft sm:text-2xl sm:leading-relaxed" style={{ ["--d" as string]: "160ms" }}>
              En personlig plan og et fællesskab, der holder dig i gang.
            </p>
            <div className="rise flex flex-wrap gap-3" style={{ ["--d" as string]: "240ms" }}>
              <ButtonLink href="/bliv-medlem" size="lg" variant="inverse">
                Bliv medlem
              </ButtonLink>
              {userId ? (
                <ButtonLink href="/hjem" variant="inverseOutline" size="lg">
                  Til medlemsområdet
                </ButtonLink>
              ) : (
                <ButtonLink href="/log-ind" variant="inverseOutline" size="lg">
                  Log ind
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="relative hidden justify-center sm:flex lg:justify-end">
            <div className="rise float" style={{ ["--d" as string]: "300ms" }}>
              <ExampleTrainingDay />
            </div>
            <div className="rise absolute -bottom-10 left-0 lg:-left-6" style={{ ["--d" as string]: "450ms" }}>
              <div className="float" style={{ ["--d" as string]: "1.2s" }}>
                <ExampleProgress />
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* Three promises */}
      <div className="border-b border-line bg-surface">
        <Container>
          <ul role="list" className="grid gap-6 py-8 sm:grid-cols-3 sm:py-10">
            {[
              { icon: "person" as const, text: "Personlig plan – ikke et standardprogram" },
              { icon: "calendar" as const, text: "Hjemme, i centeret eller udendørs" },
              { icon: "shield" as const, text: "Ingen binding – opsig når som helst" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-4">
                <BenefitIcon name={item.icon} className="h-12 w-12" />
                <span className="text-lg font-semibold">{item.text}</span>
              </li>
            ))}
          </ul>
        </Container>
      </div>

      {/* What you get */}
      <Section tone="canvas" labelledBy="medlemskab-titel">
        <div className="reveal">
          <SectionHeading id="medlemskab-titel" eyebrow="Medlemskabet" title="Alt samlet ét sted" />
          <ul role="list" className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <li key={b.title} className="space-y-3 rounded-2xl border border-line bg-surface p-6">
                <BenefitIcon name={b.icon} />
                <h3 className="font-display text-2xl">{b.title}</h3>
                <p className="text-lg text-ink-soft">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* How to start */}
      <Section tone="surface" labelledBy="forloeb-titel">
        <div className="reveal">
          <SectionHeading id="forloeb-titel" eyebrow="Sådan kommer du i gang" title="Tre enkle trin" />
          <ol role="list" className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="border-t-2 border-brand pt-6">
                <span aria-hidden="true" className="font-display text-6xl leading-none text-brand">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-2xl font-semibold">
                  <span className="sr-only">Trin {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-lg text-ink-soft">{step.text}</p>
              </li>
            ))}
          </ol>
          <MoreLink href="/saadan-fungerer-det" className="mt-10">
            Læs mere om forløbet
          </MoreLink>
        </div>
      </Section>

      {/* Price */}
      <Section id="priser" tone="tint" labelledBy="priser-titel">
        <div className="reveal">
          <SectionHeading id="priser-titel" eyebrow="Pris" title="Ét medlemskab. Ingen binding." />
          <div className="mt-12">
            <Pricing showNutrition={false} />
          </div>
          <MoreLink href="/medlemskab" className="mt-10">
            Se alle detaljer – også om den personlige kostplan
          </MoreLink>
        </div>
      </Section>

      <CtaBand title="Klar til at komme i gang?" secondary={userId ? null : { href: "/log-ind", label: "Log ind" }}>
        <p>Det tager kun få minutter.</p>
      </CtaBand>
    </>
  );
}
