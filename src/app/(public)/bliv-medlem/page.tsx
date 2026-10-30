import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { renewalPhrase } from "@/lib/payments/labels";
import { loadCheckoutContext } from "@/lib/payments/checkout-context";
import { getSiteSettings } from "@/lib/settings";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { MembershipBadge } from "@/components/ui/membership-badge";
import { AdminReadiness } from "./_components/admin-readiness";
import { MembershipConfirmed } from "./_components/membership-confirmed";
import { PaymentStatusPoller } from "./_components/payment-status-poller";
import { ProductSummary } from "./_components/product-summary";
import { MembershipCheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bliv medlem",
  description: "Se prisen, og bliv medlem. Medlemskabet fornyes automatisk og kan opsiges når som helst.",
};

function renewalText(interval: string | null | undefined) {
  const phrase = renewalPhrase(interval) ?? "hver måned";
  return `Medlemskabet fornyes automatisk ${phrase}, indtil du opsiger det. Du kan opsige når som helst og beholder adgangen resten af den periode, du har betalt for.`;
}

const PAYMENT_NOTE =
  "Du betaler med betalingskort via Stripe. MobilePay kan ikke bruges til automatisk fornyelse af medlemskabet.";

export default async function BecomeMemberPage({ searchParams }: { searchParams: Promise<{ krav?: string | string[] }> }) {
  const [{ krav }, viewer, settings, context] = await Promise.all([
    searchParams,
    getViewer(),
    getSiteSettings(),
    loadCheckoutContext("medlemskab"),
  ]);
  const { product, readiness, loadError } = context;
  const requiredMembership = (Array.isArray(krav) ? krav[0] : krav) === "medlemskab";
  const state = viewer?.membership.state ?? "none";
  const coach = settings.coach_name;

  let content: React.ReactNode;
  if (viewer?.isEntitled) {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Du er allerede medlem
        </h2>
        <p className="text-lg">
          Status: <MembershipBadge state={state} />
        </p>
        <p className="text-lg text-ink-soft">Du har adgang til hele medlemsområdet og skal ikke betale igen.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/hjem" size="lg">
            Gå til forsiden
          </ButtonLink>
          <ButtonLink href="/min-profil" variant="secondary" size="lg">
            Se dit medlemskab
          </ButtonLink>
        </div>
      </section>
    );
  } else if (viewer && state === "pending") {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Vi venter på bekræftelse af din betaling
        </h2>
        <PaymentStatusPoller waitFor="membership" loginHref="/log-ind?next=/bliv-medlem" success={<MembershipConfirmed />} />
      </section>
    );
  } else if (viewer && state === "past_due") {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Din seneste betaling mislykkedes
        </h2>
        <p className="text-lg">
          Din adgang er sat på pause, indtil betalingen er i orden. Opdater dit betalingskort under Min profil – så
          fortsætter dit medlemskab, uden at du skal melde dig ind igen.
        </p>
        <ButtonLink href="/min-profil" size="lg">
          Opdater betaling
        </ButtonLink>
      </section>
    );
  } else if (loadError) {
    content = (
      <Alert tone="warning" title="Siden kunne ikke hentes lige nu">
        Prøv at genindlæse siden om lidt.
      </Alert>
    );
  } else if (!readiness.ready) {
    content = (
      <div className="space-y-4">
        <Alert tone="info" title="Tilmelding åbner snart">
          Vi gør de sidste ting klar, så du kan melde dig ind. Kig forbi igen snart – eller skriv til os, hvis du har
          spørgsmål.
        </Alert>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/kontakt" variant="secondary">
            Kontakt os
          </ButtonLink>
          {!viewer ? (
            <ButtonLink href="/log-ind?next=/bliv-medlem" variant="ghost">
              Jeg har allerede en konto – log ind
            </ButtonLink>
          ) : null}
        </div>
      </div>
    );
  } else if (!viewer) {
    content = (
      <section aria-labelledby="trin-titel" className="space-y-6">
        <h2 id="trin-titel" className="text-2xl font-semibold">
          Sådan bliver du medlem
        </h2>
        <ol className="space-y-5">
          {[
            { title: "Opret en konto", text: "Du opretter en konto med din e-mail og en adgangskode. Det tager et par minutter." },
            {
              title: "Betal sikkert med kort",
              text: "Du betaler på Stripes sikre betalingsside. Vi ser aldrig dit kortnummer.",
            },
            {
              title: "Udfyld et kort spørgeskema",
              text: `${coach} bruger dine svar til at lave din personlige træningsplan.`,
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-lg font-semibold">
                  <span className="sr-only">Trin {index + 1}: </span>
                  {step.title}
                </p>
                <p className="text-lg text-ink-soft">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ButtonLink href="/opret-konto?next=/bliv-medlem" size="lg">
            Opret konto og fortsæt
          </ButtonLink>
          <ButtonLink href="/log-ind?next=/bliv-medlem" variant="secondary" size="lg">
            Jeg har allerede en konto – log ind
          </ButtonLink>
        </div>
      </section>
    );
  } else {
    content = (
      <section aria-labelledby="betal-titel" className="space-y-4">
        <h2 id="betal-titel" className="text-2xl font-semibold">
          Start dit medlemskab
        </h2>
        <p className="text-lg text-ink-soft">
          Når du trykker på knappen, kommer du til Stripes sikre betalingsside. Du kommer tilbage hertil bagefter.
        </p>
        <MembershipCheckoutForm />
      </section>
    );
  }

  const renewal = renewalText(product?.billing_interval);
  const description = product?.description?.trim();

  return (
    <Container size="narrow" className="space-y-10 py-12 sm:py-16">
      {requiredMembership && !viewer?.isEntitled ? (
        <Alert tone="info" title="Det kræver et medlemskab">
          Siden, du prøvede at åbne, kræver et aktivt medlemskab. Bliv medlem herunder – eller log ind, hvis du allerede
          er medlem.
        </Alert>
      ) : null}

      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Bliv medlem</h1>
        <p className="text-xl text-ink-soft">{settings.slogan}</p>
      </header>

      {product ? (
        <div className="space-y-6">
          <ProductSummary product={product} hideDescription={description === renewal} />
          <div className="space-y-3 text-lg">
            <p className="font-semibold">{renewal}</p>
            <p className="text-ink-soft">{PAYMENT_NOTE}</p>
          </div>
        </div>
      ) : null}

      {content}

      {viewer?.isAdmin ? <AdminReadiness readiness={readiness} /> : null}
    </Container>
  );
}
