import type { Metadata } from "next";
import { getViewer } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { MembershipConfirmed } from "../_components/membership-confirmed";
import { PaymentStatusPoller } from "../_components/payment-status-poller";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bekræftelse af betaling",
  robots: { index: false },
};

const LOGIN_HREF = "/log-ind?next=/bliv-medlem/bekraeftelse";

/**
 * Stripe sends the member back here after paying. This page never activates
 * anything – it waits until the verified webhook has done so.
 */
export default async function MembershipConfirmationPage() {
  const viewer = await getViewer();

  return (
    <Container size="narrow" className="space-y-8 py-12 sm:py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Tak for din tilmelding</h1>
      {!viewer ? (
        <div className="space-y-4">
          <Alert tone="warning" title="Du er ikke logget ind">
            Log ind for at se, om din betaling er bekræftet. Betalingen er ikke gået tabt.
          </Alert>
          <ButtonLink href={LOGIN_HREF} size="lg">
            Log ind
          </ButtonLink>
        </div>
      ) : viewer.isEntitled ? (
        <MembershipConfirmed />
      ) : (
        <PaymentStatusPoller waitFor="membership" loginHref={LOGIN_HREF} success={<MembershipConfirmed />} />
      )}
    </Container>
  );
}
