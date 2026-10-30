import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { getSiteSettings, placeholder } from "@/lib/settings";
import { CtaBand } from "@/components/public/cta-band";
import { FeatureList } from "@/components/public/feature-list";
import { PlaceholderNote, SettingText } from "@/components/public/placeholder-text";
import { Eyebrow, Section, SectionHeading } from "@/components/public/section";
import { SiteImage } from "@/components/public/site-image";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: `Om ${settings.coach_name}`,
    description: `Mød ${settings.coach_name}, som laver de personlige træningsplaner i ${settings.business_name}.`,
  };
}

export default async function AboutCoachPage() {
  const settings = await getSiteSettings();
  const coach = settings.coach_name;

  return (
    <>
      <div className="border-b border-line bg-brand-soft py-16 sm:py-24">
        <Container className="grid items-start gap-12 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-6">
            <Eyebrow>Din træner</Eyebrow>
            <h1 className="text-5xl leading-[1.05] sm:text-6xl">Mød {coach}</h1>
            <SettingText value={settings.coach_bio} label={`Præsentation af ${coach}`} className="max-w-prose text-xl" />
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink href="/bliv-medlem" size="lg">
                Bliv medlem
              </ButtonLink>
              <ButtonLink href="/kontakt" variant="secondary" size="lg">
                Skriv til {coach}
              </ButtonLink>
            </div>
          </div>
          <SiteImage
            path={settings.coach_photo_path}
            alt={`Foto af ${coach}`}
            placeholderLabel={`Portrætfoto af ${coach}`}
            monogram={coach}
            className="rounded-2xl lg:order-first lg:aspect-[4/5]"
            priority
          />
        </Container>
      </div>

      <Section tone="surface" labelledBy="uddannelse-titel">
        <div className="max-w-3xl space-y-6">
          <SectionHeading id="uddannelse-titel" title="Uddannelse og erfaring" />
          <PlaceholderNote>{placeholder(null, `Uddannelse, certificeringer og erfaring for ${coach}`)}</PlaceholderNote>
        </div>
      </Section>

      <Section labelledBy="forvente-titel">
        <div className="grid gap-10 lg:grid-cols-2">
          <SectionHeading id="forvente-titel" title={`Det kan du forvente af ${coach}`}>
            <p>Sådan fungerer samarbejdet, når du er medlem.</p>
          </SectionHeading>
          <FeatureList
            items={[
              "Din plan laves personligt ud fra dine svar – ikke af et automatisk program.",
              "Planen bliver justeret, når du gør fremskridt, eller hvis noget ikke fungerer for dig.",
              `Du kan skrive direkte til ${coach} under Beskeder.`,
              `${coach} er selv med i fællesskabet og deler nyt med medlemmerne.`,
            ]}
          />
        </div>
      </Section>

      <CtaBand title="Klar til at komme i gang?" secondary={{ href: "/saadan-fungerer-det", label: "Se, hvordan det fungerer" }}>
        <p>Bliv medlem, udfyld spørgeskemaet, og få en plan, der passer til dig.</p>
      </CtaBand>
    </>
  );
}
