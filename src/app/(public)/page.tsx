import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Contours } from "@/components/ui/decor";
import { getSiteSettings } from "@/lib/settings";
import { isPlaceholderText } from "@/components/public/copy";
import { CtaBand } from "@/components/public/cta-band";
import { FaqList } from "@/components/public/faq";
import { faqEntries } from "@/components/public/faq-content";
import { CheckIcon, FeatureList } from "@/components/public/feature-list";
import { BenefitIcon, PlaceIllustration, type BenefitIconName } from "@/components/public/illustrations";
import { Pricing } from "@/components/public/pricing";
import { getPublicProducts } from "@/components/public/products";
import { Eyebrow, Section, SectionHeading } from "@/components/public/section";
import { SettingText } from "@/components/public/placeholder-text";
import { SiteImage } from "@/components/public/site-image";
import { Steps } from "@/components/public/steps";
import { MoreLink, TextLink } from "@/components/public/text-link";
import { TrainingPlaces } from "@/components/public/training-places";

export const dynamic = "force-dynamic";

const FAQ_TEASER_IDS = ["for-mig", "udstyr", "hvornaar-faar-jeg-planen"];

/**
 * Illustrative example of a training day as it appears under "Min træning".
 * Clearly captioned as an example – it is not a member's real plan.
 */
function ExampleTrainingDay() {
  const rows = [
    { name: "Rejs dig fra stol", dose: "3 × 10" },
    { name: "Roning med elastik", dose: "3 × 12" },
    { name: "Gåtur i rask tempo", dose: "20 min" },
  ];
  return (
    <figure className="w-full max-w-sm rounded-xl bg-surface p-5 text-ink shadow-[0_24px_48px_-16px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
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

export default async function HomePage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const coach = settings.coach_name;
  const nutrition = products.nutrition;
  const nutritionText = !isPlaceholderText(settings.nutrition_description)
    ? settings.nutrition_description
    : (nutrition?.description ?? nutrition?.short_description ?? null);

  const faqTeaser = faqEntries({ settings, membership: products.memberships[0] ?? null, nutrition }).filter((e) =>
    FAQ_TEASER_IDS.includes(e.id),
  );

  const benefits: { icon: BenefitIconName; title: string; text: string }[] = [
    { icon: "plan", title: "Din egen træningsplan", text: `${coach} laver planen personligt ud fra dine mål, dit niveau og din hverdag.` },
    { icon: "community", title: "Et fællesskab", text: "En fælles chat med andre mænd over 50, der også er i gang." },
    { icon: "message", title: "Direkte kontakt", text: `Skriv privat til ${coach}, når du har spørgsmål undervejs.` },
    { icon: "video", title: "Videoer af øvelserne", text: "Se, hvordan øvelserne udføres, så du kan træne trygt." },
    { icon: "news", title: `Nyt fra ${coach}`, text: "Motivation, gode råd og forslag til steder at træne." },
    { icon: "progress", title: "Planen følger med dig", text: "Når du bliver stærkere, bliver planen justeret." },
  ];

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden bg-night text-on-night">
        <Contours className="text-on-night/10" />
        <Container className="relative grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          <div className="space-y-8">
            <p className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.14em] text-accent-light">
              <span aria-hidden="true" className="h-0.5 w-8 bg-current" />
              Personlig træning for mænd over 50
            </p>
            <h1 className="text-[2.6rem] leading-[1.05] text-balance sm:text-6xl lg:text-7xl">
              Bliv stærkere. Få mere energi. Hold dig i gang.
            </h1>
            <p className="max-w-xl text-xl text-on-night-soft sm:text-2xl sm:leading-relaxed">
              Personlig træning og et stærkt fællesskab for mænd over 50. Få en plan, der passer til din hverdag, dit niveau
              og dine mål.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/bliv-medlem" size="lg" variant="inverse">
                Bliv medlem
              </ButtonLink>
              <ButtonLink href="/om-christian" variant="inverseOutline" size="lg">
                Mød {coach}
              </ButtonLink>
            </div>
          </div>

          <div className="relative">
            <SiteImage
              path={settings.hero_image_path}
              alt={`Træning hos ${settings.business_name}`}
              placeholderLabel={`${coach} træner med et medlem udendørs`}
              className="aspect-[4/5] rounded-2xl sm:aspect-[5/5] lg:aspect-[4/5]"
              priority
            />
            <div className="relative -mt-24 px-4 sm:absolute sm:-bottom-10 sm:-left-10 sm:mt-0 sm:px-0">
              <ExampleTrainingDay />
            </div>
          </div>
        </Container>
      </div>

      {/* Promise strip */}
      <div className="border-b border-line bg-surface">
        <Container>
          <ul role="list" className="grid gap-6 py-8 sm:grid-cols-3 sm:py-10">
            {[
              { icon: "person" as const, text: `Planen laves personligt af ${coach}` },
              { icon: "calendar" as const, text: "Træn hjemme, i centeret eller udendørs" },
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

      {/* What members get */}
      <Section tone="canvas" labelledBy="medlemskab-titel">
        <SectionHeading id="medlemskab-titel" eyebrow="Medlemskabet" title="Alt, du har brug for, ét sted">
          {!isPlaceholderText(settings.membership_description) ? <p>{settings.membership_description}</p> : null}
        </SectionHeading>
        <ul role="list" className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <li key={b.title} className="space-y-4">
              <BenefitIcon name={b.icon} />
              <h3 className="font-display text-2xl">{b.title}</h3>
              <p className="text-lg text-ink-soft">{b.text}</p>
            </li>
          ))}
        </ul>
        <MoreLink href="/medlemskab" className="mt-12">
          Se pris og betingelser
        </MoreLink>
      </Section>

      {/* How personal coaching works */}
      <Section tone="surface" labelledBy="forloeb-titel">
        <div className="grid gap-14 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-8 lg:sticky lg:top-28 lg:self-start">
            <SectionHeading id="forloeb-titel" eyebrow="Sådan fungerer det" title="Personlig træning – trin for trin">
              <p>
                Du skal ikke selv finde ud af, hvad du skal træne. {coach} lægger planen ud fra dine svar og justerer den,
                når du udvikler dig.
              </p>
            </SectionHeading>
            <MoreLink href="/saadan-fungerer-det">Læs mere om forløbet</MoreLink>
          </div>
          <Steps
            items={[
              { title: "Bliv medlem", text: "Opret en konto, og betal sikkert med betalingskort." },
              {
                title: "Udfyld et kort spørgeskema",
                text: "Fortæl om dit niveau, dine mål, din hverdag og det udstyr, du har adgang til.",
              },
              {
                title: `${coach} laver din personlige plan`,
                text: `Planen bliver lavet af ${coach} selv – ikke automatisk. Du får besked, når den er klar.`,
              },
              {
                title: "Træn, skriv og del i fællesskabet",
                text: "Følg planen under Min træning, stil spørgsmål, og del dine fremskridt med de andre.",
              },
              {
                title: "Planen justeres løbende",
                text: `Når du bliver stærkere, eller hvis noget ikke passer, tilpasser ${coach} planen.`,
              },
            ]}
          />
        </div>
      </Section>

      {/* The coach */}
      <Section tone="tint" labelledBy="traener-titel">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
          <SiteImage
            path={settings.coach_photo_path}
            alt={`Foto af ${coach}`}
            placeholderLabel={`Portrætfoto af ${coach}`}
            className="aspect-[4/5] rounded-2xl bg-surface"
          />
          <div className="space-y-8">
            <SectionHeading id="traener-titel" eyebrow="Din træner" title={`Mød ${coach}`} />
            <SettingText value={settings.coach_short_bio} label={`Kort præsentation af ${coach}`} className="text-xl" />
            <ButtonLink href="/om-christian" size="lg">
              Læs mere om {coach}
            </ButtonLink>
          </div>
        </div>
      </Section>

      {/* Community */}
      <Section tone="canvas" labelledBy="faellesskab-titel">
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr]">
          <SectionHeading id="faellesskab-titel" eyebrow="Fællesskabet" title="Du træner ikke alene">
            <p>
              Som medlem bliver du en del af et fællesskab af mænd over 50, som også er i gang. Her kan I dele erfaringer,
              stille spørgsmål, fortælle om små og store sejre og holde hinanden fast på at komme afsted.
            </p>
            <p>Fællesskabet er kun for medlemmer, og vi forventer en venlig og respektfuld tone.</p>
          </SectionHeading>
          <div className="rounded-xl border border-line bg-surface p-8">
            <Eyebrow>Inkluderet i medlemskabet</Eyebrow>
            <FeatureList
              className="mt-6"
              items={[
                "Fælles chat for alle medlemmer",
                `Private beskeder – også direkte med ${coach}`,
                `Nyt og opslag fra ${coach}`,
                "Kun for medlemmer – ingen reklamer",
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Home, gym, outdoors */}
      <Section tone="surface" labelledBy="steder-titel">
        <SectionHeading id="steder-titel" eyebrow="Hvor du træner" title="Hjemme, i fitnesscenteret eller udendørs">
          <p>
            Planen passer til de rammer, du har. Du fortæller, hvor du helst træner, og hvilket udstyr du har – så bygger{" "}
            {coach} planen op omkring det.
          </p>
        </SectionHeading>
        <div className="mt-14">
          <TrainingPlaces />
        </div>
      </Section>

      {/* Optional nutrition plan */}
      {nutrition ? (
        <Section tone="canvas" labelledBy="kostplan-titel">
          <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr]">
            <SectionHeading id="kostplan-titel" eyebrow="Tilkøb" title="Personlig kostplan – hvis du vil have mere">
              {nutritionText ? <p className="whitespace-pre-line">{nutritionText}</p> : null}
              <p>Kostplanen er frivillig og kan købes, når du er medlem.</p>
            </SectionHeading>
            <div className="rounded-xl border border-line bg-brand-soft p-10">
              <PlaceIllustration name="nutrition" />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Pricing */}
      <Section id="priser" tone="tint" labelledBy="priser-titel">
        <SectionHeading id="priser-titel" eyebrow="Priser" title="Medlemskab og priser">
          <p>Her kan du se, hvad det koster, hvordan medlemskabet fornyes, og hvordan du opsiger.</p>
        </SectionHeading>
        <div className="mt-12">
          <Pricing />
        </div>
        <MoreLink href="/medlemskab" className="mt-10">
          Læs mere om betaling, opsigelse og fortrydelsesret
        </MoreLink>
      </Section>

      {/* FAQ teaser and contact */}
      <Section tone="canvas" labelledBy="spoergsmaal-titel">
        <div className="grid gap-14 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-8">
            <SectionHeading id="spoergsmaal-titel" eyebrow="Spørgsmål og svar" title="Godt at vide, før du starter" />
            <FaqList items={faqTeaser} />
            <MoreLink href="/faq">Se alle spørgsmål og svar</MoreLink>
          </div>
          <aside aria-labelledby="kontakt-titel" className="space-y-5 self-start rounded-xl border border-line bg-surface p-8">
            <h2 id="kontakt-titel" className="text-3xl">
              Har du et spørgsmål?
            </h2>
            <p className="text-lg text-ink-soft">
              Skriv til {coach}, hvis du vil høre mere, eller hvis du er i tvivl om, hvorvidt medlemskabet passer til dig.
            </p>
            <ButtonLink href="/kontakt" variant="secondary" size="lg">
              Skriv til {coach}
            </ButtonLink>
            <p className="border-t border-line pt-5 text-ink-soft">
              Læs også, hvordan vi passer på dine oplysninger i vores{" "}
              <TextLink href="/privatlivspolitik">privatlivspolitik</TextLink>, og se vores{" "}
              <TextLink href="/handelsbetingelser">handelsbetingelser</TextLink>.
            </p>
          </aside>
        </div>
      </Section>

      <CtaBand title="Klar til at blive stærkere?" secondary={{ href: "/saadan-fungerer-det", label: "Se, hvordan det fungerer" }}>
        <p>Det tager få minutter at komme i gang – og du kan opsige når som helst.</p>
      </CtaBand>
    </>
  );
}
