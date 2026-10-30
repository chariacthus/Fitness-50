import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CommunityIcon, HomeIcon, MessageIcon, ProfileIcon, TrainingIcon } from "@/components/icons";
import { getSiteSettings } from "@/lib/settings";
import { renewalPhrase } from "@/components/public/copy";
import { CtaBand } from "@/components/public/cta-band";
import { getPublicProducts } from "@/components/public/products";
import { PageIntro, Section, SectionHeading } from "@/components/public/section";
import { Steps } from "@/components/public/steps";
import { TextLink } from "@/components/public/text-link";
import { TrainingPlaces } from "@/components/public/training-places";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sådan fungerer det",
  description: "Fra du melder dig ind, til du træner efter din egen personlige plan – hele forløbet trin for trin.",
};

export default async function HowItWorksPage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const coach = settings.coach_name;
  const renewal = renewalPhrase(products.memberships[0]?.billing_interval);

  const areas: { title: string; text: string; icon: ReactNode }[] = [
    {
      title: "Hjem",
      text: `Dit overblik med det vigtigste lige nu – blandt andet nyt fra ${coach}.`,
      icon: <HomeIcon className="h-7 w-7" />,
    },
    {
      title: "Fællesskab",
      text: "Den fælles chat og opslag, hvor medlemmerne deler erfaringer og spørgsmål.",
      icon: <CommunityIcon className="h-7 w-7" />,
    },
    {
      title: "Beskeder",
      text: `Private beskeder med ${coach} og med andre medlemmer.`,
      icon: <MessageIcon className="h-7 w-7" />,
    },
    {
      title: "Min træning",
      text: "Din personlige træningsplan – og din kostplan, hvis du har købt en.",
      icon: <TrainingIcon className="h-7 w-7" />,
    },
    {
      title: "Min profil",
      text: "Dine oplysninger, dit medlemskab, dine samtykker og opsigelse.",
      icon: <ProfileIcon className="h-7 w-7" />,
    },
  ];

  return (
    <>
      <PageIntro title="Sådan fungerer det" eyebrow="Forløbet">
        <p>
          Fra du melder dig ind, til du træner efter din egen plan – her er hele forløbet, trin for trin. Du skal ikke kunne
          noget på forhånd.
        </p>
      </PageIntro>

      <Section tone="surface" labelledBy="trin-titel">
        <div className="grid gap-12 lg:grid-cols-[2fr_3fr]">
          <SectionHeading id="trin-titel" title="Fra tilmelding til træning">
            <p>
              Alle planer bliver lavet af {coach} selv. Der er ingen automatiske planer og ingen kunstig intelligens, der
              bestemmer, hvad du skal træne.
            </p>
          </SectionHeading>
          <Steps
            items={[
              {
                title: "Bliv medlem",
                text: "Opret en konto med din e-mail, og vælg medlemskabet. Du kan se prisen og betingelserne, før du betaler.",
              },
              {
                title: "Betal sikkert",
                text: (
                  <>
                    Du betaler med betalingskort via betalingsudbyderen Stripe. Vi gemmer ikke dine kortoplysninger.
                    Medlemskabet fornyes automatisk{renewal ? ` ${renewal}` : ""}, indtil du opsiger det.
                  </>
                ),
              },
              {
                title: "Udfyld et kort spørgeskema",
                text: "Du fortæller om dit niveau, dine mål, din hverdag, hvor du træner, og hvilket udstyr du har. Helbredsoplysninger deler du kun, hvis du selv vil.",
              },
              {
                title: `${coach} laver din personlige plan`,
                text: `${coach} gennemgår dine svar og sammensætter planen selv. Du får en notifikation, når den er klar.`,
              },
              {
                title: "Træn, skriv og del",
                text: `Din plan ligger under Min træning. I fællesskabet kan du dele erfaringer med de andre medlemmer, og under Beskeder kan du skrive direkte med ${coach}.`,
              },
              {
                title: "Planen bliver opdateret",
                text: `Når du gør fremskridt, eller hvis noget ikke passer, justerer ${coach} planen. Dine tidligere planer kan du stadig finde.`,
              },
              {
                title: "Opsig når som helst",
                text: "Du kan opsige under Min profil. Du beholder adgangen resten af den periode, du har betalt for.",
              },
            ]}
          />
        </div>
      </Section>

      <Section labelledBy="omraader-titel">
        <SectionHeading id="omraader-titel" title="Det ser du, når du er logget ind">
          <p>Medlemsområdet har fem faste punkter i menuen, så det er let at finde rundt.</p>
        </SectionHeading>
        <ul role="list" className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li key={area.title} className="flex gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                {area.icon}
              </span>
              <div>
                <h3 className="text-xl font-semibold">{area.title}</h3>
                <p className="mt-1 text-lg text-ink-soft">{area.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" labelledBy="steder-titel">
        <SectionHeading id="steder-titel" title="Hjemme, i fitnesscenteret eller udendørs">
          <p>
            Du vælger selv, hvor du træner. {coach} bygger planen op omkring de rammer og det udstyr, du har. Læs mere om{" "}
            <TextLink href="/om-christian">{coach}</TextLink>.
          </p>
        </SectionHeading>
        <div className="mt-10">
          <TrainingPlaces />
        </div>
      </Section>

      <CtaBand title="Vil du i gang?" tone="canvas" secondary={{ href: "/medlemskab", label: "Se priser" }}>
        <p>Se, hvad medlemskabet koster, eller meld dig ind med det samme.</p>
      </CtaBand>
    </>
  );
}
