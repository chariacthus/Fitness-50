import { describe, expect, it } from "vitest";
import { getCheckoutReadiness, readyExceptCheckoutSwitch, type StripeEnvironment } from "@/lib/stripe/readiness";

const TEST_KEYS: StripeEnvironment = { hasSecretKey: true, hasWebhookSecret: true, testMode: true };
const LIVE_KEYS: StripeEnvironment = { hasSecretKey: true, hasWebhookSecret: true, testMode: false };

const testProduct = { is_active: true, price_amount: 9900, stripe_price_id: "price_test_1", is_test: true };
const liveProduct = { ...testProduct, is_test: false, stripe_price_id: "price_live_1" };
const open = { checkout_enabled: true };

describe("getCheckoutReadiness", () => {
  it("is ready when everything is in place (test product + test keys)", () => {
    expect(getCheckoutReadiness(testProduct, open, TEST_KEYS)).toEqual({ ready: true, reasons: [], issues: [] });
  });

  it("is ready for a real product with live keys", () => {
    expect(getCheckoutReadiness(liveProduct, open, LIVE_KEYS).ready).toBe(true);
  });

  it("requires both Stripe secrets", () => {
    const noKeys = getCheckoutReadiness(testProduct, open, { hasSecretKey: false, hasWebhookSecret: false, testMode: false });
    expect(noKeys.ready).toBe(false);
    expect(noKeys.issues).toEqual(["missing_secret_key", "missing_webhook_secret"]);
    const noWebhook = getCheckoutReadiness(testProduct, open, { ...TEST_KEYS, hasWebhookSecret: false });
    expect(noWebhook.issues).toEqual(["missing_webhook_secret"]);
  });

  it("requires an active product with a price and a Stripe price", () => {
    expect(getCheckoutReadiness(null, open, TEST_KEYS).issues).toEqual(["missing_product"]);
    expect(getCheckoutReadiness({ ...testProduct, is_active: false }, open, TEST_KEYS).issues).toEqual(["inactive"]);
    expect(getCheckoutReadiness({ ...testProduct, price_amount: null }, open, TEST_KEYS).issues).toEqual(["missing_price"]);
    expect(getCheckoutReadiness({ ...testProduct, stripe_price_id: null }, open, TEST_KEYS).issues).toEqual([
      "missing_stripe_price",
    ]);
  });

  it("requires checkout to be enabled by an administrator", () => {
    const closed = getCheckoutReadiness(testProduct, { checkout_enabled: false }, TEST_KEYS);
    expect(closed.issues).toEqual(["checkout_disabled"]);
    expect(readyExceptCheckoutSwitch(closed)).toBe(true);
    expect(getCheckoutReadiness(testProduct, null, TEST_KEYS).issues).toEqual(["checkout_disabled"]);
  });

  it("never sells a test product with live keys", () => {
    const result = getCheckoutReadiness(testProduct, open, LIVE_KEYS);
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(["test_product_live_keys"]);
  });

  it("does not sell a real product while Stripe runs in test mode", () => {
    const result = getCheckoutReadiness(liveProduct, open, TEST_KEYS);
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(["live_product_test_keys"]);
    expect(readyExceptCheckoutSwitch(result)).toBe(false);
  });

  it("explains every problem in Danish", () => {
    const result = getCheckoutReadiness(
      { is_active: false, price_amount: null, stripe_price_id: null, is_test: true },
      { checkout_enabled: false },
      { hasSecretKey: false, hasWebhookSecret: false, testMode: false },
    );
    expect(result.reasons).toHaveLength(result.issues.length);
    expect(result.reasons.join(" ")).toMatch(/Stripe-nøglen/);
    expect(result.reasons.join(" ")).toMatch(/ikke aktivt/);
    expect(result.reasons.join(" ")).toMatch(/lukket/);
  });
});
