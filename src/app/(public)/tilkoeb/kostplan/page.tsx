import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { loadCheckoutContext } from "@/lib/payments/checkout-context";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { AdminReadiness } from "../../bliv-medlem/_components/admin-readiness";
import { ProductSummary } from "../../bliv-medlem/_components/product-summary";
import { NutritionCheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tilkøb: personlig kostplan",
  description: "Køb en personlig kostplan som tilkøb til dit medlemskab. Betales én gang.",
};

async function hasNutritionAddon() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_addon", { p_slug: "kostplan" });
  return { has: Boolean(data), error: Boolean(error) };
}

export default async function NutritionAddonPage() {
  const [viewer, context] = await Promise.all([getViewer(), loadCheckoutContext("kostplan")]);
  const { product, readiness, loadError } = context;
  const addon = viewer ? await hasNutritionAddon() : { has: false, error: false };

  let content: React.ReactNode;
  if (loadError || addon.error) {
    content = (
      <Alert tone="warning" title="Siden kunne ikke hentes lige nu">
        Prøv at genindlæse siden om lidt.
      </Alert>
    );
  } else if (viewer && addon.has) {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Du har købt kostplanen
        </h2>
        <p className="text-lg text-ink-soft">
          Du finder din kostplan under Min træning, når den er klar. Har du ikke besvaret kostspørgsmålene endnu, kan du
          gøre det nu.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/min-traening/kostplan" size="lg">
            Gå til din kostplan
          </ButtonLink>
          <ButtonLink href="/onboarding?trin=7" variant="secondary" size="lg">
            Besvar kostspørgsmålene
          </ButtonLink>
        </div>
      </section>
    );
  } else if (!viewer) {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Kostplanen kræver et medlemskab
        </h2>
        <p className="text-lg text-ink-soft">
          Kostplanen er et tilkøb til medlemskabet. Log ind, hvis du allerede er medlem – ellers kan du blive medlem først.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/log-ind?next=/tilkoeb/kostplan" size="lg">
            Log ind
          </ButtonLink>
          <ButtonLink href="/bliv-medlem" variant="secondary" size="lg">
            Bliv medlem
          </ButtonLink>
        </div>
      </section>
    );
  } else if (!viewer.isEntitled) {
    content = (
      <section aria-labelledby="status-titel" className="space-y-4">
        <h2 id="status-titel" className="text-2xl font-semibold">
          Kostplanen kræver et aktivt medlemskab
        </h2>
        <p className="text-lg text-ink-soft">
          Kostplanen er et tilkøb til medlemskabet. Når dit medlemskab er aktivt, kan du købe den her.
        </p>
        <ButtonLink href="/bliv-medlem" size="lg">
          Bliv medlem
        </ButtonLink>
      </section>
    );
  } else if (!product || !readiness.ready) {
    content = (
      <Alert tone="info" title="Kostplanen kan købes snart">
        Vi gør de sidste ting klar. Kig forbi igen snart – eller skriv til os, hvis du har spørgsmål.
      </Alert>
    );
  } else {
    content = (
      <section aria-labelledby="betal-titel" className="space-y-4">
        <h2 id="betal-titel" className="text-2xl font-semibold">
          Køb kostplanen
        </h2>
        <p className="text-lg text-ink-soft">
          Når du trykker på knappen, kommer du til Stripes sikre betalingsside. Du kommer tilbage hertil bagefter.
        </p>
        <NutritionCheckoutForm />
      </section>
    );
  }

  return (
    <Container size="narrow" className="space-y-10 py-12 sm:py-16">
      <header className="space-y-4">
        <p className="text-lg font-semibold text-brand">Tilkøb</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Personlig kostplan</h1>
      </header>

      {product ? (
        <div className="space-y-6">
          <ProductSummary product={product} />
          <div className="space-y-3 text-lg">
            <p className="font-semibold">Kostplanen er et engangskøb. Den fornyes ikke, og du bliver ikke trukket igen.</p>
            <p className="text-ink-soft">
              {product.mobilepay_enabled
                ? "Du betaler med betalingskort eller MobilePay via Stripe."
                : "Du betaler med betalingskort via Stripe."}
            </p>
          </div>
        </div>
      ) : null}

      {content}

      {viewer?.isAdmin ? <AdminReadiness readiness={readiness} /> : null}
    </Container>
  );
}
