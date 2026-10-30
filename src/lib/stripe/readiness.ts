import "server-only";
import { isStripeTestMode, serverEnv } from "@/lib/server-env";
import type { Tables } from "@/lib/database.types";

// Can this product be sold right now? Checked before showing a checkout button
// AND again inside the server action that creates the Stripe Checkout Session.

export type ReadinessProduct = Pick<
  Tables<"products">,
  "is_active" | "price_amount" | "stripe_price_id" | "is_test"
>;

export type ReadinessSettings = Pick<Tables<"admin_settings">, "checkout_enabled">;

export type StripeEnvironment = {
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  testMode: boolean;
};

export type ReadinessIssue =
  | "missing_secret_key"
  | "missing_webhook_secret"
  | "missing_product"
  | "inactive"
  | "missing_price"
  | "missing_stripe_price"
  | "checkout_disabled"
  | "test_product_live_keys"
  | "live_product_test_keys";

export type CheckoutReadiness = {
  ready: boolean;
  /** Danish explanations, shown to administrators. */
  reasons: string[];
  issues: ReadinessIssue[];
};

const MESSAGES: Record<ReadinessIssue, string> = {
  missing_secret_key: "Stripe-nøglen (STRIPE_SECRET_KEY) er ikke sat på serveren.",
  missing_webhook_secret: "Webhook-nøglen (STRIPE_WEBHOOK_SECRET) er ikke sat, så betalinger kan ikke bekræftes.",
  missing_product: "Produktet findes ikke.",
  inactive: "Produktet er ikke aktivt.",
  missing_price: "Der er ikke sat en pris på produktet.",
  missing_stripe_price: "Produktet er ikke forbundet til en pris i Stripe. Gem produktet eller tryk “Synkroniser med Stripe”.",
  checkout_disabled: "Tilmelding og køb er lukket under betalingsopsætningen.",
  test_product_live_keys:
    "Produktet er markeret som testprodukt, men Stripe kører med live-nøgler. Testprodukter kan kun købes i testtilstand.",
  live_product_test_keys:
    "Stripe kører i testtilstand, men produktet er ikke markeret som testprodukt. Brug live-nøgler, før et rigtigt produkt sælges.",
};

export function currentStripeEnvironment(): StripeEnvironment {
  return {
    hasSecretKey: Boolean(serverEnv.stripeSecretKey),
    hasWebhookSecret: Boolean(serverEnv.stripeWebhookSecret),
    testMode: isStripeTestMode(),
  };
}

/**
 * Checks Stripe keys, the product (active, price, Stripe price id), whether
 * checkout is open, and that test products are only sold with test keys
 * (and real products only with live keys).
 */
export function getCheckoutReadiness(
  product: ReadinessProduct | null | undefined,
  adminSettings: ReadinessSettings | null | undefined,
  env: StripeEnvironment = currentStripeEnvironment(),
): CheckoutReadiness {
  const issues: ReadinessIssue[] = [];
  if (!env.hasSecretKey) issues.push("missing_secret_key");
  if (!env.hasWebhookSecret) issues.push("missing_webhook_secret");

  if (!product) {
    issues.push("missing_product");
  } else {
    if (!product.is_active) issues.push("inactive");
    if (product.price_amount == null || product.price_amount <= 0) issues.push("missing_price");
    if (!product.stripe_price_id) issues.push("missing_stripe_price");
    if (env.hasSecretKey) {
      if (product.is_test && !env.testMode) issues.push("test_product_live_keys");
      if (!product.is_test && env.testMode) issues.push("live_product_test_keys");
    }
  }

  if (!adminSettings?.checkout_enabled) issues.push("checkout_disabled");

  return { ready: issues.length === 0, reasons: issues.map((i) => MESSAGES[i]), issues };
}

/** Readiness ignoring the open/closed switch – used before an admin opens checkout. */
export function readyExceptCheckoutSwitch(readiness: CheckoutReadiness) {
  return readiness.issues.every((i) => i === "checkout_disabled");
}
