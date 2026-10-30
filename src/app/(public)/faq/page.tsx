import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { getSiteSettings } from "@/lib/settings";
import { FaqList } from "@/components/public/faq";
import { faqEntries } from "@/components/public/faq-content";
import { getPublicProducts } from "@/components/public/products";
import { PageIntro, Section } from "@/components/public/section";

// Pre-rendered and refreshed every 5 minutes (no per-visitor data on this page).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Ofte stillede spørgsmål",
  description: "Svar på de mest almindelige spørgsmål om træningsplanen, fællesskabet, betaling, opsigelse og dine oplysninger.",
};

export default async function FaqPage() {
  const [settings, products] = await Promise.all([getSiteSettings(), getPublicProducts()]);
  const items = faqEntries({ settings, membership: products.memberships[0] ?? null, nutrition: products.nutrition });

  return (
    <>
      <PageIntro title="Ofte stillede spørgsmål" eyebrow="Spørgsmål og svar">
        <p>Tryk på et spørgsmål for at se svaret.</p>
      </PageIntro>

      <Section tone="surface" size="narrow" labelledBy="spoergsmaal-titel">
        <h2 id="spoergsmaal-titel" className="sr-only">
          Spørgsmål
        </h2>
        <FaqList items={items} />
      </Section>

      <Section size="narrow" labelledBy="mere-hjaelp-titel">
        <div className="space-y-4">
          <h2 id="mere-hjaelp-titel" className="text-3xl font-bold tracking-tight">
            Fandt du ikke svaret?
          </h2>
          <p className="text-xl text-ink-soft">Du er velkommen til at skrive til {settings.coach_name} med dit spørgsmål.</p>
          <ButtonLink href="/kontakt" size="lg">
            Skriv til {settings.coach_name}
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
