import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { getSiteSettings } from "@/lib/settings";
import { isPlaceholderText } from "@/components/public/copy";
import { FaqList } from "@/components/public/faq";
import { faqEntries } from "@/components/public/faq-content";
import { CheckIcon, FeatureList } from "@/components/public/feature-list";
import { Pricing } from "@/components/public/pricing";
import { getPublicProducts } from "@/components/public/products";
import { Section, SectionHeading, type SectionTone } from "@/components/public/section";
import { SettingText } from "@/components/public/placeholder-text";
import { SiteImage } from "@/components/public/site-image";
import { Steps } from "@/components/public/steps";
import { MoreLink, TextLink } from "@/components/public/text-link";
import { TrainingPlaces } from "@/components/public/training-places";

export const dynamic = "force-dynamic";

const FAQ_TEASER_IDS = ["for-mig", "udstyr", "hvornaar-faar-jeg-planen"];

export default async function HomePage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const coach = settings.coach_name;
  const membership = products.memberships[0] ?? null;
  const nutrition = products.nutrition;
  const nutritionText = !isPlaceholderText(settings.nutrition_description)
    ? settings.nutrition_description
    : (nutrition?.description ?? nutrition?.short_description ?? null);

  // Sections below the hero alternate white/warm backgrounds, also when the
  // optional nutrition section is hidden.
  const order = ["medlemskab", "forloeb", "traener", "faellesskab", "steder", nutrition ? "kostplan" : null, "priser", "spoergsmaal"].filter(
    (key): key is string => key !== null,
  );
  const tone = (key: string): SectionTone => (order.indexOf(key) % 2 === 0 ? "surface" : "canvas");

  const faqTeaser = faqEntries({ settings, membership, nutrition }).filter((e) => FAQ_TEASER_IDS.includes(e.id));

  return (
    <>
      {/* Hero */}
      <div className="bg-canvas py-14 sm:py-20">
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <p className="text-lg font-semibold text-brand">Online træning med {coach}</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Bliv stærkere. Få mere energi. Hold dig i gang.
            </h1>
            <p className="max-w-xl text-xl text-ink-soft">
              Personlig træning og et stærkt fællesskab for mænd over 50. Få en plan, der passer til din hverdag, dit niveau
              og dine mål.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink href="/bliv-medlem" size="lg">
                Bliv medlem
              </ButtonLink>
              <ButtonLink href="/om-christian" variant="secondary" size="lg">
                Mød {coach}
              </ButtonLink>
            </div>
            <ul role="list" className="space-y-2 pt-2 text-lg">
              {[`Planen laves personligt af ${coach}`, "Træn hjemme, i fitnesscenteret eller udendørs", "Du kan opsige når som helst"].map(
                (point) => (
                  <li key={point} className="flex gap-3">
                    <CheckIcon className="mt-0.5 text-brand" />
                    <span>{point}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
          <SiteImage
            path={settings.hero_image_path}
            alt={`Træning hos ${settings.business_name}`}
            placeholderLabel={`Foto af ${coach}, der træner med et medlem udendørs`}
            className="lg:aspect-[4/5]"
            priority
          />
        </Container>
      </div>

      {/* What members get */}
      <Section tone={tone("medlemskab")} labelledBy="medlemskab-titel">
        <SectionHeading id="medlemskab-titel" eyebrow="Medlemskabet" title="Det får du som medlem">
          {!isPlaceholderText(settings.membership_description) ? <p>{settings.membership_description}</p> : null}
        </SectionHeading>
        {membership && membership.features.length > 0 ? (
          <FeatureList items={membership.features} columns={2} className="mt-10 max-w-4xl" />
        ) : null}
        <MoreLink href="/medlemskab" className="mt-8">
          Se pris og betingelser
        </MoreLink>
      </Section>

      {/* How personal coaching works */}
      <Section tone={tone("forloeb")} labelledBy="forloeb-titel">
        <div className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-6">
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
      <Section tone={tone("traener")} labelledBy="traener-titel">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <SectionHeading id="traener-titel" eyebrow="Din træner" title={`Mød ${coach}`} />
            <SettingText value={settings.coach_short_bio} label={`Kort præsentation af ${coach}`} className="text-xl" />
            <ButtonLink href="/om-christian" variant="secondary" size="lg">
              Læs mere om {coach}
            </ButtonLink>
          </div>
          <SiteImage
            path={settings.coach_photo_path}
            alt={`Foto af ${coach}`}
            placeholderLabel={`Portrætfoto af ${coach}`}
          />
        </div>
      </Section>

      {/* Community */}
      <Section tone={tone("faellesskab")} labelledBy="faellesskab-titel">
        <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
          <SectionHeading id="faellesskab-titel" eyebrow="Fællesskabet" title="Du træner ikke alene">
            <p>
              Som medlem bliver du en del af et fællesskab af mænd over 50, som også er i gang. Her kan I dele erfaringer,
              stille spørgsmål, fortælle om små og store sejre og holde hinanden fast på at komme afsted.
            </p>
            <p>Fællesskabet er kun for medlemmer, og vi forventer en venlig og respektfuld tone.</p>
          </SectionHeading>
          <FeatureList
            className="self-end"
            items={[
              "Fælles chat for alle medlemmer",
              `Private beskeder – også direkte med ${coach}`,
              `Nyt og opslag fra ${coach}`,
            ]}
          />
        </div>
      </Section>

      {/* Home, gym, outdoors */}
      <Section tone={tone("steder")} labelledBy="steder-titel">
        <SectionHeading id="steder-titel" eyebrow="Hvor du træner" title="Træn hjemme, i fitnesscenteret eller udendørs">
          <p>
            Planen passer til de rammer, du har. Du fortæller, hvor du helst træner, og hvilket udstyr du har – så bygger{" "}
            {coach} planen op omkring det.
          </p>
        </SectionHeading>
        <div className="mt-10">
          <TrainingPlaces />
        </div>
      </Section>

      {/* Optional nutrition plan */}
      {nutrition ? (
        <Section tone={tone("kostplan")} labelledBy="kostplan-titel">
          <SectionHeading id="kostplan-titel" eyebrow="Tilkøb" title="Personlig kostplan – hvis du vil have mere">
            {nutritionText ? <p className="whitespace-pre-line">{nutritionText}</p> : null}
            <p>Kostplanen er frivillig og kan købes, når du er medlem.</p>
          </SectionHeading>
          <MoreLink href="#kostplan" className="mt-8">
            Se prisen på kostplanen
          </MoreLink>
        </Section>
      ) : null}

      {/* Pricing */}
      <Section id="priser" tone={tone("priser")} labelledBy="priser-titel">
        <SectionHeading id="priser-titel" eyebrow="Priser" title="Medlemskab og priser">
          <p>Her kan du se, hvad det koster, hvordan medlemskabet fornyes, og hvordan du opsiger.</p>
        </SectionHeading>
        <div className="mt-10">
          <Pricing />
        </div>
        <MoreLink href="/medlemskab" className="mt-8">
          Læs mere om betaling, opsigelse og fortrydelsesret
        </MoreLink>
      </Section>

      {/* FAQ teaser and contact */}
      <Section tone={tone("spoergsmaal")} labelledBy="spoergsmaal-titel">
        <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-6">
            <SectionHeading id="spoergsmaal-titel" eyebrow="Spørgsmål og svar" title="Godt at vide, før du starter" />
            <FaqList items={faqTeaser} />
            <MoreLink href="/faq">Se alle spørgsmål og svar</MoreLink>
          </div>
          <aside aria-labelledby="kontakt-titel" className="space-y-4 lg:border-l lg:border-line lg:pl-12">
            <h2 id="kontakt-titel" className="text-2xl font-semibold">
              Har du et spørgsmål?
            </h2>
            <p className="text-lg text-ink-soft">
              Skriv til {coach}, hvis du vil høre mere, eller hvis du er i tvivl om, hvorvidt medlemskabet passer til dig.
            </p>
            <ButtonLink href="/kontakt" variant="secondary" size="lg">
              Skriv til {coach}
            </ButtonLink>
            <p className="pt-4 text-ink-soft">
              Læs også, hvordan vi passer på dine oplysninger i vores{" "}
              <TextLink href="/privatlivspolitik">privatlivspolitik</TextLink>, og se vores{" "}
              <TextLink href="/handelsbetingelser">handelsbetingelser</TextLink>.
            </p>
          </aside>
        </div>
      </Section>
    </>
  );
}

