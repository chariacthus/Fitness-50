import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Betalingen blev afbrudt",
  robots: { index: false },
};

export default function CheckoutCanceledPage() {
  return (
    <Container size="narrow" className="space-y-8 py-12 sm:py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Betalingen blev afbrudt</h1>
      <div className="space-y-4 text-lg">
        <p>Betalingen blev afbrudt, og du er ikke blevet opkrævet.</p>
        <p className="text-ink-soft">
          Du kan prøve igen, når du er klar. Har du spørgsmål til medlemskabet eller betalingen, er du velkommen til at
          skrive til os.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/bliv-medlem" size="lg">
          Prøv igen
        </ButtonLink>
        <ButtonLink href="/kontakt" variant="secondary" size="lg">
          Kontakt os
        </ButtonLink>
      </div>
    </Container>
  );
}
