import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { getSiteSettings, siteAssetUrl } from "@/lib/settings";
import { CtaBand } from "@/components/public/cta-band";
import { AuthSwitch } from "@/components/layout/auth-switch";
import { Pricing } from "@/components/public/pricing";
import { Section, SectionHeading } from "@/components/public/section";
import { MoreLink } from "@/components/public/text-link";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

/** Illustrative example of a training day in "Min træning" – captioned as an example. */
function ExampleTrainingDay() {
  const rows = [
    { name: "Rejs dig fra stol", dose: "3 × 10" },
    { name: "Roning med elastik", dose: "3 × 12" },
    { name: "Gåtur i rask tempo", dose: "20 min" },
  ];
  return (
    <figure className="w-full max-w-sm rounded-xl bg-surface p-6 text-ink">
      <figcaption className="text-sm text-ink-soft">Eksempel fra Min træning</figcaption>
      <p className="mt-1 font-display text-2xl">Dag 1: Hele kroppen</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-4 py-3">
            <span>{row.name}</span>
            <span className="shrink-0 font-semibold">{row.dose}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  const coach = settings.coach_name;
  const heroImage = siteAssetUrl(settings.hero_image_path);

  const benefits = [
    { title: "Din egen plan", text: "Lavet til dine mål, dit niveau og din hverdag." },
    { title: "Et fællesskab", text: "Mænd over 50, der også er i gang." },
    { title: "Direkte kontakt", text: `Skriv til ${coach}, når du har spørgsmål.` },
    { title: "Videoer", text: "Se præcis, hvordan øvelserne laves." },
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
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image from the public site bucket
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        ) : null}
        <Container className="relative grid items-center gap-16 py-20 sm:py-28 lg:grid-cols-[1.2fr_1fr] lg:py-32">
          <div className="space-y-8">
            <h1 className="text-[2.6rem] leading-[1.05] text-balance sm:text-6xl lg:text-7xl">
              Bliv stærkere. Få mere energi. Hold dig i gang.
            </h1>
            <p className="max-w-lg text-xl text-on-night-soft sm:text-2xl sm:leading-relaxed">
              Personlig træning og et fællesskab for mænd over 50.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/bliv-medlem" size="lg" variant="inverse">
                Bliv medlem
              </ButtonLink>
              <AuthSwitch
                loggedIn={
                  <ButtonLink href="/hjem" variant="inverseOutline" size="lg">
                    Til medlemsområdet
                  </ButtonLink>
                }
                loggedOut={
                  <ButtonLink href="/log-ind" variant="inverseOutline" size="lg">
                    Log ind
                  </ButtonLink>
                }
              />
            </div>
            <p className="text-on-night-soft">Ingen binding – du kan opsige når som helst.</p>
          </div>

          <div className="hidden justify-end sm:flex">
            <ExampleTrainingDay />
          </div>
        </Container>
      </div>

      {/* What you get */}
      <Section tone="canvas" labelledBy="medlemskab-titel">
        <div>
          <SectionHeading id="medlemskab-titel" title="Det får du som medlem" />
          <ul role="list" className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b) => (
              <li key={b.title} className="space-y-2 border-t-2 border-ink pt-5">
                <h3 className="font-display text-2xl">{b.title}</h3>
                <p className="text-lg text-ink-soft">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* How to start */}
      <Section tone="surface" labelledBy="forloeb-titel">
        <div>
          <SectionHeading id="forloeb-titel" title="Tre enkle trin" />
          <ol role="list" className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="pt-1">
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
        <div>
          <SectionHeading id="priser-titel" title="Ét medlemskab. Ingen binding." />
          <div className="mt-12">
            <Pricing showNutrition={false} />
          </div>
          <MoreLink href="/medlemskab" className="mt-10">
            Se alle detaljer – også om den personlige kostplan
          </MoreLink>
        </div>
      </Section>

      <CtaBand title="Klar til at komme i gang?" secondary={{ href: "/log-ind", label: "Log ind" }}>
        <p>Det tager kun få minutter.</p>
      </CtaBand>
    </>
  );
}
