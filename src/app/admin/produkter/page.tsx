import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { formatDKK, formatInterval } from "@/lib/format";
import { oreToKronerInput } from "@/lib/payments/money";
import { mobilePayRecurringStatus } from "@/lib/payments/mobilepay";
import { getCheckoutReadiness, readyExceptCheckoutSwitch } from "@/lib/stripe/readiness";
import { isEmailConfigured, isStripeTestMode, serverEnv } from "@/lib/server-env";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailList, EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/layout";
import { CheckoutSwitch } from "./checkout-switch";
import { ProductForm, SyncProductForm } from "./product-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Priser og produkter" };

function StatusText({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <Badge tone={ok ? "success" : "warning"}>{children}</Badge>;
}

export default async function AdminProductsPage() {
  await requireAdmin("/admin/produkter");
  const supabase = await createClient();
  const [{ data: products, error: productsError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("products").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("admin_settings").select("checkout_enabled, email_notifications_enabled").eq("id", 1).maybeSingle(),
  ]);

  const hasKey = Boolean(serverEnv.stripeSecretKey);
  const hasWebhook = Boolean(serverEnv.stripeWebhookSecret);
  const testMode = isStripeTestMode();
  const checkoutEnabled = Boolean(settings?.checkout_enabled);
  const membership = products?.find((p) => p.slug === "medlemskab") ?? null;
  const membershipReadiness = getCheckoutReadiness(membership, { checkout_enabled: true });
  const mobilePay = mobilePayRecurringStatus();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Priser og produkter"
        description="Her styrer du priserne, forbindelsen til Stripe, og om man kan melde sig ind."
      />

      {productsError || settingsError ? (
        <Alert tone="danger">Oplysningerne kunne ikke hentes. Prøv at genindlæse siden.</Alert>
      ) : null}

      <Panel className="space-y-6">
        <SectionTitle id="opsaetning">Betalingsopsætning</SectionTitle>
        <DetailList
          items={[
            {
              label: "Stripe-nøgle",
              value: hasKey ? (
                <StatusText ok>{testMode ? "Sat – testtilstand" : "Sat – live (rigtige betalinger)"}</StatusText>
              ) : (
                <StatusText ok={false}>Mangler (STRIPE_SECRET_KEY)</StatusText>
              ),
            },
            {
              label: "Webhook-nøgle",
              value: (
                <div className="space-y-1">
                  {hasWebhook ? <StatusText ok>Sat</StatusText> : <StatusText ok={false}>Mangler (STRIPE_WEBHOOK_SECRET)</StatusText>}
                  <p className="text-ink-soft">
                    Webhook-adresse i Stripe: <span className="break-all font-mono text-base">{publicEnv.siteUrl}/api/webhooks/stripe</span>
                  </p>
                </div>
              ),
            },
            {
              label: "Tilmelding og køb",
              value: (
                <div className="space-y-3">
                  {checkoutEnabled ? <StatusText ok>Åben</StatusText> : <StatusText ok={false}>Lukket</StatusText>}
                  <CheckoutSwitch enabled={checkoutEnabled} canEnable={membershipReadiness.ready} />
                </div>
              ),
            },
            {
              label: "E-mail",
              value: isEmailConfigured() ? (
                <span>
                  <StatusText ok>Opsat</StatusText>{" "}
                  {settings?.email_notifications_enabled ? "E-mails til medlemmer er slået til." : "E-mails til medlemmer er slået fra under Indstillinger."}
                </span>
              ) : (
                <StatusText ok={false}>Ikke opsat – der sendes ingen e-mails</StatusText>
              ),
            },
            {
              label: "MobilePay til medlemskab",
              value: <span>{mobilePay.reason}</span>,
            },
            {
              label: "MobilePay til engangskøb",
              value: (
                <span>
                  Kan bruges til kostplanen via Stripe. Aktivér MobilePay i Stripe under Indstillinger → Betalingsmetoder, og
                  slå det derefter til på kostplanen herunder.
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <section aria-labelledby="produkter-titel" className="space-y-6">
        <SectionTitle id="produkter-titel">Produkter</SectionTitle>
        {!hasKey ? (
          <Alert tone="info" title="Stripe er ikke sat op endnu">
            Du kan godt gemme navne og priser nu. De sendes til Stripe, når nøglerne er sat og du trykker “Synkroniser med
            Stripe”.
          </Alert>
        ) : null}

        {products && products.length === 0 ? <EmptyState title="Der er ingen produkter endnu" /> : null}

        {(products ?? []).map((product) => {
          const readiness = getCheckoutReadiness(product, { checkout_enabled: checkoutEnabled });
          const otherwiseReady = readyExceptCheckoutSwitch(readiness);
          return (
            <Panel key={product.id} as="article" className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-semibold">{product.kind === "membership" ? "Medlemskab" : "Tilkøb"}: {product.name}</h3>
                {product.is_test ? <Badge tone="warning">Testprodukt</Badge> : null}
                {product.is_active ? <Badge tone="success">Aktivt</Badge> : <Badge>Ikke aktivt</Badge>}
              </div>

              <DetailList
                items={[
                  {
                    label: "Pris",
                    value: `${formatDKK(product.price_amount)}${product.price_amount != null ? ` ${formatInterval(product.billing_interval)}` : ""}`,
                  },
                  { label: "Stripe-produkt", value: <span className="break-all font-mono text-base">{product.stripe_product_id ?? "Ikke oprettet"}</span> },
                  { label: "Stripe-pris", value: <span className="break-all font-mono text-base">{product.stripe_price_id ?? "Ikke oprettet"}</span> },
                  ...(product.kind === "addon"
                    ? [{ label: "MobilePay", value: product.mobilepay_enabled ? "Tilladt" : "Ikke tilladt" }]
                    : []),
                  {
                    label: "Kan købes nu",
                    value: readiness.ready ? (
                      <StatusText ok>Ja</StatusText>
                    ) : (
                      <div className="space-y-2">
                        <StatusText ok={false}>{otherwiseReady ? "Klar – men tilmelding er lukket" : "Nej"}</StatusText>
                        <ul className="list-disc space-y-1 pl-6">
                          {readiness.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                  },
                ]}
              />

              {hasKey ? (
                <SyncProductForm productId={product.id} />
              ) : (
                <p className="text-ink-soft">Synkronisering med Stripe bliver mulig, når STRIPE_SECRET_KEY er sat.</p>
              )}

              <details className="group rounded-md border border-line">
                <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">
                  Rediger {product.name}
                </summary>
                <div className="border-t border-line p-4 sm:p-6">
                  <ProductForm
                    product={{
                      id: product.id,
                      kind: product.kind,
                      name: product.name,
                      short_description: product.short_description,
                      description: product.description,
                      features: product.features,
                      priceInput: oreToKronerInput(product.price_amount),
                      billing_interval: product.billing_interval,
                      is_active: product.is_active,
                      is_test: product.is_test,
                      mobilepay_enabled: product.mobilepay_enabled,
                      sort_order: product.sort_order,
                    }}
                  />
                </div>
              </details>
            </Panel>
          );
        })}
      </section>
    </div>
  );
}
