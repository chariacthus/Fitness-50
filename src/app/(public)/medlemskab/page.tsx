import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/settings";
import { CARD_PAYMENT_NOTE, isPlaceholderText, renewalPhrase } from "@/components/public/copy";
import { CtaBand } from "@/components/public/cta-band";
import { FaqList, type FaqEntry } from "@/components/public/faq";
import { NutritionCard, Pricing } from "@/components/public/pricing";
import { getPublicProducts } from "@/components/public/products";
import { PageIntro, Section, SectionHeading } from "@/components/public/section";
import { TextLink } from "@/components/public/text-link";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Medlemskab og priser",
  description: "Se prisen på medlemskabet og kostplanen, og læs om automatisk fornyelse, opsigelse, fortrydelsesret og betaling.",
};

export default async function MembershipPage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const coach = settings.coach_name;
  const membership = products.memberships[0] ?? null;
  const nutrition = products.nutrition;
  const renewal = renewalPhrase(membership?.billing_interval);
  const nutritionText = !isPlaceholderText(settings.nutrition_description)
    ? settings.nutrition_description
    : (nutrition?.description ?? null);

  const billingFaq: FaqEntry[] = [
    {
      id: "hvornaar-trukket",
      question: "Hvornår bliver jeg trukket?",
      answer: (
        <p>
          Første gang, når du melder dig ind. Derefter bliver beløbet trukket automatisk{renewal ? ` ${renewal}` : ""},
          indtil du opsiger medlemskabet.
        </p>
      ),
    },
    {
      id: "hvordan-opsiger-jeg",
      question: "Hvordan opsiger jeg?",
      answer: (
        <p>
          Under Min profil, når du er logget ind. Opsigelsen gælder fra udgangen af den periode, du har betalt for, og du
          beholder adgangen indtil da. Der bliver ikke trukket flere betalinger.
        </p>
      ),
    },
    {
      id: "betaling-fejler",
      question: "Hvad sker der, hvis en betaling ikke går igennem?",
      answer: (
        <p>
          Så får du besked, så du kan få betalingen på plads. I en kort periode beholder du adgangen, mens betalingen bliver
          forsøgt igen. Lykkes det ikke, bliver din adgang sat på pause, indtil betalingen er i orden.
        </p>
      ),
    },
    {
      id: "betaling-mobilepay",
      question: "Kan jeg betale med MobilePay?",
      answer: (
        <p>
          Ikke for medlemskabet. MobilePay kan ikke bruges til automatisk fornyelse, så medlemskabet betales med
          betalingskort.
          {nutrition?.mobilepay_enabled ? " Kostplanen kan derimod også betales med MobilePay." : null}
        </p>
      ),
    },
    {
      id: "kortoplysninger",
      question: "Gemmer I mine kortoplysninger?",
      answer: (
        <p>
          Nej. Betalingen foregår hos betalingsudbyderen Stripe. Vi gemmer ikke dit kortnummer og kan ikke se det. Læs mere i
          vores <TextLink href="/privatlivspolitik">privatlivspolitik</TextLink>.
        </p>
      ),
    },
    {
      id: "prisaendring",
      question: "Kan prisen ændre sig?",
      answer: (
        <p>
          Hvis prisen bliver ændret, får du besked i god tid, før den nye pris gælder for dig, så du kan nå at opsige, hvis
          du ikke ønsker at fortsætte.
        </p>
      ),
    },
  ];

  return (
    <>
      <PageIntro title="Medlemskab og priser" eyebrow="Medlemskab">
        <p>
          {!isPlaceholderText(settings.membership_description)
            ? settings.membership_description
            : `Ét medlemskab giver adgang til din personlige træningsplan, fællesskabet og beskeder med ${coach}.`}
        </p>
      </PageIntro>

      <Section id="priser" tone="surface" labelledBy="priser-titel">
        <SectionHeading id="priser-titel" title="Pris på medlemskabet" />
        <div className="mt-8">
          <Pricing showNutrition={false} />
        </div>
      </Section>

      <Section labelledBy="godt-at-vide-titel">
        <SectionHeading id="godt-at-vide-titel" title="Godt at vide om betaling og opsigelse" />
        <div className="mt-10 grid gap-10 lg:grid-cols-3">
          <div className="space-y-3 border-t-2 border-brand pt-5">
            <h3 className="text-xl font-semibold">Fornyelse og opsigelse</h3>
            <p className="text-lg text-ink-soft">
              Medlemskabet fornyes automatisk{renewal ? ` ${renewal}` : ""}, indtil du opsiger det. Du kan opsige når som
              helst under Min profil. Du beholder adgangen resten af den periode, du har betalt for, og der bliver ikke
              trukket flere betalinger.
            </p>
          </div>
          <div className="space-y-3 border-t-2 border-brand pt-5">
            <h3 className="text-xl font-semibold">Fortrydelsesret</h3>
            <p className="text-lg text-ink-soft">
              Når du køber online, har du 14 dages fortrydelsesret efter forbrugeraftaleloven. Beder du om at komme i gang
              med det samme og fortryder inden for de 14 dage, betaler du kun for den del, du har nået at bruge.
            </p>
            <p className="text-lg">
              Læs de fulde regler i <TextLink href="/handelsbetingelser">handelsbetingelserne</TextLink>.
            </p>
          </div>
          <div className="space-y-3 border-t-2 border-brand pt-5">
            <h3 className="text-xl font-semibold">Betaling</h3>
            <p className="text-lg text-ink-soft">
              {CARD_PAYMENT_NOTE} Betalingen foregår sikkert hos betalingsudbyderen Stripe, og vi gemmer ikke dine
              kortoplysninger.
            </p>
            {nutrition ? (
              <p className="text-lg text-ink-soft">
                {nutrition.mobilepay_enabled
                  ? "Kostplanen kan betales med betalingskort eller MobilePay."
                  : "Kostplanen betales med betalingskort."}
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      {nutrition ? (
        <Section tone="surface" labelledBy="kostplan-titel">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <SectionHeading id="kostplan-titel" eyebrow="Tilkøb" title="Personlig kostplan">
              {nutritionText ? <p className="whitespace-pre-line">{nutritionText}</p> : null}
              <p>
                Kostplanen er frivillig og kræver et medlemskab. {coach} laver den personligt ud fra dine svar.
                {nutrition.billing_interval === "one_time" ? " Den betales én gang og fornyes ikke." : null}
              </p>
            </SectionHeading>
            <NutritionCard product={nutrition} />
          </div>
        </Section>
      ) : null}

      <Section tone={nutrition ? "canvas" : "surface"} labelledBy="betaling-spoergsmaal-titel">
        <div className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <SectionHeading id="betaling-spoergsmaal-titel" title="Spørgsmål om betaling">
            <p>
              Find flere svar under <TextLink href="/faq">Ofte stillede spørgsmål</TextLink>.
            </p>
          </SectionHeading>
          <FaqList items={billingFaq} />
        </div>
      </Section>

      <CtaBand title="Klar til at blive medlem?" tone={nutrition ? "surface" : "canvas"}>
        <p>Du kan opsige når som helst og beholder adgangen resten af den betalte periode.</p>
      </CtaBand>
    </>
  );
}
