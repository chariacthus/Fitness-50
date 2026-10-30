import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { PaymentStatusPoller } from "../../../bliv-medlem/_components/payment-status-poller";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bekræftelse af køb",
  robots: { index: false },
};

const LOGIN_HREF = "/log-ind?next=/tilkoeb/kostplan/bekraeftelse";

function NutritionConfirmed() {
  return (
    <div className="space-y-5">
      <Alert tone="success" title="Tak for dit køb">
        Din betaling for kostplanen er bekræftet.
      </Alert>
      <p className="text-lg">
        Næste skridt er nogle få spørgsmål om dine kostvaner og præferencer. Dine svar bruges til at lave din personlige
        kostplan.
      </p>
      <ButtonLink href="/onboarding?trin=7" size="lg">
        Besvar kostspørgsmålene
      </ButtonLink>
    </div>
  );
}

/** Waits for the verified webhook to mark the purchase as paid. Never activates anything itself. */
export default async function NutritionConfirmationPage() {
  const viewer = await getViewer();
  let alreadyConfirmed = false;
  if (viewer) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("has_addon", { p_slug: "kostplan" });
    alreadyConfirmed = Boolean(data);
  }

  return (
    <Container size="narrow" className="space-y-8 py-12 sm:py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Tak for din bestilling</h1>
      {!viewer ? (
        <div className="space-y-4">
          <Alert tone="warning" title="Du er ikke logget ind">
            Log ind for at se, om din betaling er bekræftet. Betalingen er ikke gået tabt.
          </Alert>
          <ButtonLink href={LOGIN_HREF} size="lg">
            Log ind
          </ButtonLink>
        </div>
      ) : alreadyConfirmed ? (
        <NutritionConfirmed />
      ) : (
        <PaymentStatusPoller waitFor="nutrition" loginHref={LOGIN_HREF} success={<NutritionConfirmed />} />
      )}
    </Container>
  );
}
