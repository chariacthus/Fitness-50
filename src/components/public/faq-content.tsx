import type { SiteSettings } from "@/lib/settings";
import { renewalPhrase } from "@/components/public/copy";
import type { FaqEntry } from "@/components/public/faq";
import type { PublicProduct } from "@/components/public/products";
import { TextLink } from "@/components/public/text-link";

type FaqContext = {
  settings: SiteSettings;
  membership: PublicProduct | null;
  nutrition: PublicProduct | null;
};

/** All questions for /faq. The homepage shows a few of them by id. */
export function faqEntries({ settings, membership, nutrition }: FaqContext): FaqEntry[] {
  const coach = settings.coach_name;
  const business = settings.business_name;
  const renewal = renewalPhrase(membership?.billing_interval);

  const entries: (FaqEntry | null)[] = [
    {
      id: "for-mig",
      question: `Er ${business} noget for mig?`,
      answer: (
        <>
          <p>
            {business} er for mænd over 50 på alle niveauer – også hvis det er mange år siden, du sidst har trænet. Din plan
            bliver tilpasset dit udgangspunkt, så du starter et sted, der passer til dig.
          </p>
          <p>
            Har du en sygdom, en skade eller smerter, eller er du i tvivl om, hvor meget du kan tåle, så tal med din læge,
            før du går i gang.
          </p>
        </>
      ),
    },
    {
      id: "udstyr",
      question: "Skal jeg have noget udstyr?",
      answer: (
        <p>
          Nej, ikke nødvendigvis. I spørgeskemaet fortæller du, hvor du træner, og hvad du har adgang til – for eksempel
          ingenting, et par håndvægte, elastikker eller et fitnesscenter. Planen bliver lavet ud fra det.
        </p>
      ),
    },
    {
      id: "hvordan-laves-planen",
      question: "Hvordan bliver min plan lavet?",
      answer: (
        <p>
          {coach} laver din plan personligt ud fra dine svar i spørgeskemaet: dit niveau, dine mål, din hverdag og det
          udstyr, du har. Planen bliver ikke lavet automatisk eller af et computerprogram.
        </p>
      ),
    },
    {
      id: "hvornaar-faar-jeg-planen",
      question: "Hvornår får jeg min plan?",
      answer: (
        <p>
          Hver plan bliver lavet i hånden, så vi lover ikke et bestemt tidspunkt. {coach} går i gang, når du har udfyldt
          spørgeskemaet, og du får en notifikation i medlemsområdet, så snart din plan er klar.
        </p>
      ),
    },
    {
      id: "opsigelse",
      question: "Hvordan opsiger jeg mit medlemskab?",
      answer: (
        <p>
          Du kan opsige når som helst under Min profil, når du er logget ind. Du beholder adgangen resten af den periode, du
          har betalt for, og der bliver ikke trukket flere betalinger.
        </p>
      ),
    },
    {
      id: "pris",
      question: "Hvad koster det?",
      answer: (
        <p>
          Du kan se de aktuelle priser under <TextLink href="/medlemskab">Medlemskab og priser</TextLink>. Der står også,
          hvordan medlemskabet fornyes, og hvordan du opsiger.
        </p>
      ),
    },
    {
      id: "mobilepay",
      question: "Kan jeg betale med MobilePay?",
      answer: (
        <>
          <p>
            Medlemskabet betales med betalingskort, fordi det fornyes automatisk{renewal ? ` ${renewal}` : ""}. MobilePay
            kan ikke bruges til automatisk fornyelse hos os.
          </p>
          {nutrition?.mobilepay_enabled ? <p>Kostplanen, som er et tilkøb, kan også betales med MobilePay.</p> : null}
        </>
      ),
    },
    {
      id: "behandling",
      question: "Er det medicinsk behandling?",
      answer: (
        <p>
          Nej. {business} er træningsvejledning og ikke sundhedsfaglig behandling. {coach} stiller ikke diagnoser og
          erstatter ikke din læge, fysioterapeut eller anden behandler. Lyt til din krop, og stop, hvis noget gør ondt.
        </p>
      ),
    },
    {
      id: "data",
      question: "Hvad sker der med mine oplysninger?",
      answer: (
        <>
          <p>
            Vi bruger kun dine oplysninger til at levere medlemskabet. Helbredsoplysninger gemmer vi kun, hvis du selv giver
            udtrykkeligt samtykke, og du kan trække samtykket tilbage under Min profil. Dine kortoplysninger håndteres af
            betalingsudbyderen Stripe – vi gemmer dem ikke.
          </p>
          <p>
            Læs mere i vores <TextLink href="/privatlivspolitik">privatlivspolitik</TextLink>.
          </p>
        </>
      ),
    },
    {
      id: "faellesskab",
      question: "Hvad er fællesskabet?",
      answer: (
        <p>
          Fællesskabet er kun for medlemmer. Her kan I dele erfaringer, stille spørgsmål og fortælle om jeres fremskridt,
          og {coach} er selv med. Du kan også skrive private beskeder til {coach} og andre medlemmer. Vi forventer en venlig
          og respektfuld tone, og indhold, der ikke hører hjemme, kan anmeldes.
        </p>
      ),
    },
    nutrition
      ? {
          id: "kostplan",
          question: "Hvad er kostplanen?",
          answer: (
            <p>
              Kostplanen er et frivilligt tilkøb, som kræver et medlemskab. {coach} sammensætter den personligt ud fra dine
              vaner, præferencer og mål.
              {nutrition.billing_interval === "one_time" ? " Den betales én gang og fornyes ikke." : null} Du kan se prisen
              under <TextLink href="/medlemskab#kostplan">Medlemskab og priser</TextLink>.
            </p>
          ),
        }
      : null,
    {
      id: "kontakt",
      question: `Hvordan kontakter jeg ${coach}?`,
      answer: (
        <p>
          Som medlem kan du skrive direkte til {coach} under Beskeder. Er du ikke medlem endnu, kan du bruge{" "}
          <TextLink href="/kontakt">kontaktformularen</TextLink>.
        </p>
      ),
    },
  ];

  return entries.filter((e): e is FaqEntry => e !== null);
}
