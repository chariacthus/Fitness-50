import type { ReactNode } from "react";
import { formatDate, formatDKK, formatInterval } from "@/lib/format";
import type { MembershipSummary } from "@/lib/membership";
import { PURCHASE_STATUS, statusInfo } from "@/lib/payments/labels";
import type { BillingInfo } from "@/lib/profile/billing";
import { InlineActionForm } from "@/components/profile/inline-action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DetailList, Panel } from "@/components/ui/layout";
import { MembershipBadge } from "@/components/ui/membership-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeCancellation, openBillingPortal } from "./actions";

export type PurchaseRow = { id: string; status: string; amount: number | null; created_at: string; paid_at: string | null; productName: string };

const UNAVAILABLE = "Betalingsoplysninger er ikke tilgængelige lige nu.";

function PortalButton({ label, variant = "secondary" }: { label: string; variant?: "primary" | "secondary" }) {
  return (
    <InlineActionForm action={openBillingPortal} pendingText="Åbner betalingssiden…">
      <SubmitButton variant={variant} pendingText="Åbner…">
        {label}
      </SubmitButton>
    </InlineActionForm>
  );
}

export function MembershipSection({
  summary,
  billing,
  stripeReady,
  purchases,
  purchasesError,
}: {
  summary: MembershipSummary;
  billing: BillingInfo;
  stripeReady: boolean;
  purchases: PurchaseRow[];
  purchasesError: boolean;
}) {
  const state = summary.state;
  const isStripe = summary.provider === "stripe";
  const hasSubscription = Boolean(summary.subscription_id);
  const canUsePortal = stripeReady && state !== "admin" && billing.status === "ok" && billing.hasCustomer;
  // A Stripe subscription the member can cancel, resume or fix here.
  const manageable = isStripe && hasSubscription && ["active", "canceling", "past_due_grace", "past_due"].includes(state);

  const details: { label: string; value: ReactNode }[] = [{ label: "Status", value: <MembershipBadge state={state} /> }];
  if (hasSubscription && summary.product_name) details.push({ label: "Medlemskab", value: summary.product_name });
  if (hasSubscription && summary.amount != null) {
    details.push({ label: "Pris", value: `${formatDKK(summary.amount)} ${formatInterval(summary.billing_interval)}`.trim() });
  }
  if (state === "active" && summary.current_period_end) {
    details.push({ label: "Fornyelse", value: `Fornyes automatisk ${formatDate(summary.current_period_end)}` });
  }
  if (state === "canceling") {
    details.push({
      label: "Opsagt",
      value: summary.access_until ? `Opsagt – du har adgang til og med ${formatDate(summary.access_until)}` : "Opsagt – du har adgang resten af perioden",
    });
  }
  if (hasSubscription && isStripe && state !== "admin") {
    details.push({
      label: "Betalingskort",
      value:
        !stripeReady || billing.status === "unavailable"
          ? UNAVAILABLE
          : billing.paymentMethod ?? "Der er ikke gemt et betalingskort.",
    });
  }

  return (
    <div className="space-y-6">
      {state === "past_due_grace" || state === "past_due" ? (
        <Alert tone="danger" title="Din seneste betaling gik ikke igennem">
          <p>
            {state === "past_due_grace"
              ? `Du har stadig adgang${summary.grace_until ? ` indtil ${formatDate(summary.grace_until)}` : " et par dage endnu"}. Opdater dit betalingskort, så du ikke mister adgangen.`
              : "Din adgang er sat på pause, indtil betalingen er på plads. Opdater dit betalingskort for at få adgang igen."}
          </p>
          {canUsePortal ? (
            <div className="mt-3">
              <PortalButton label="Opdater betalingskort" variant="primary" />
            </div>
          ) : (
            <p className="mt-2 font-semibold">{UNAVAILABLE} Prøv igen senere, eller kontakt os.</p>
          )}
        </Alert>
      ) : null}

      <Panel className="space-y-5">
        <DetailList items={details} />

        {state === "admin" ? <p className="text-ink-soft">Du er administrator og har adgang til alt uden et medlemskab.</p> : null}
        {state === "pending" ? (
          <p className="text-ink-soft">Vi har endnu ikke fået besked om, at din betaling er gennemført. Det tager som regel kun et øjeblik.</p>
        ) : null}
        {state === "none" || state === "expired" ? (
          <div className="space-y-3">
            <p className="max-w-prose">
              {state === "expired" ? "Dit medlemskab er udløbet. Du er altid velkommen tilbage." : "Du har ikke et medlemskab endnu."}
            </p>
            <ButtonLink href="/bliv-medlem" size="lg">
              {state === "expired" ? "Bliv medlem igen" : "Bliv medlem"}
            </ButtonLink>
          </div>
        ) : null}

        {manageable && !stripeReady ? (
          <p className="border-t border-line pt-5 text-ink-soft">{UNAVAILABLE} Du kan derfor ikke ændre dit medlemskab her i øjeblikket.</p>
        ) : null}
        {canUsePortal || (manageable && stripeReady && (state === "active" || state === "canceling")) ? (
          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:items-start">
            {canUsePortal ? <PortalButton label="Administrer betaling og kvitteringer" /> : null}
            {manageable && stripeReady && (state === "active" || state === "canceling") ? (
              <InlineActionForm
                action={changeCancellation}
                hidden={{ mode: state === "active" ? "cancel" : "resume" }}
                pendingText={state === "active" ? "Opsiger medlemskabet…" : "Genoptager medlemskabet…"}
              >
                {state === "active" ? (
                  <ConfirmButton
                    title="Opsig dit medlemskab?"
                    description={
                      <div className="space-y-2">
                        <p>
                          Du har stadig adgang til og med{" "}
                          {summary.current_period_end ? formatDate(summary.current_period_end) : "slutningen af den betalte periode"}. Derefter
                          stopper medlemskabet, og du bliver ikke trukket flere gange.
                        </p>
                        <p>Du kan fortryde opsigelsen her på siden, så længe perioden ikke er slut.</p>
                      </div>
                    }
                    confirmLabel="Ja, opsig medlemskabet"
                  >
                    Opsig medlemskab
                  </ConfirmButton>
                ) : (
                  <SubmitButton pendingText="Genoptager…">Genoptag medlemskab</SubmitButton>
                )}
              </InlineActionForm>
            ) : null}
          </div>
        ) : null}
        {!isStripe && hasSubscription && state !== "admin" && state !== "none" && state !== "expired" ? (
          <p className="text-ink-soft">Kontakt os, hvis du vil ændre dit medlemskab.</p>
        ) : null}
      </Panel>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold">Tilkøb</h3>
        {purchasesError ? (
          <p className="text-ink-soft">Dine tilkøb kunne ikke hentes lige nu.</p>
        ) : purchases.length === 0 ? (
          <p className="text-ink-soft">Du har ikke købt noget ud over dit medlemskab.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {purchases.map((p) => {
              const info = statusInfo(PURCHASE_STATUS, p.status);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold">{p.productName}</p>
                    <p className="text-ink-soft">
                      {formatDate(p.paid_at ?? p.created_at)}
                      {p.amount != null ? ` · ${formatDKK(p.amount)}` : ""}
                    </p>
                  </div>
                  <Badge tone={info.tone}>{info.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
