import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { verifyStripeWebhook } from "@/lib/stripe/webhook";

// A local Stripe instance – no network calls are made by signature verification.
const stripe = new Stripe("sk_test_dummy_key_for_signature_tests");
const SECRET = "whsec_test_secret_for_unit_tests";

const payload = JSON.stringify(
  {
    id: "evt_1TestEvent",
    object: "event",
    api_version: "2026-10-28.endive",
    created: 1793354400,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1QnewShape", object: "subscription", status: "active" } },
  },
  null,
  2,
);

function signedHeader(body: string, secret = SECRET, timestamp?: number) {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });
}

describe("verifyStripeWebhook", () => {
  it("accepts a correctly signed payload and returns the event", () => {
    const result = verifyStripeWebhook(stripe.webhooks, payload, signedHeader(payload), SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt_1TestEvent");
      expect(result.event.type).toBe("customer.subscription.updated");
    }
  });

  it("rejects a tampered payload", () => {
    const header = signedHeader(payload);
    const tampered = payload.replace('"status": "active"', '"status": "canceled"');
    expect(tampered).not.toBe(payload);
    expect(verifyStripeWebhook(stripe.webhooks, tampered, header, SECRET).ok).toBe(false);
  });

  it("rejects a re-serialised body (signature covers the raw bytes)", () => {
    const header = signedHeader(payload);
    const reserialised = JSON.stringify(JSON.parse(payload));
    expect(verifyStripeWebhook(stripe.webhooks, reserialised, header, SECRET).ok).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const header = signedHeader(payload, "whsec_someone_else");
    expect(verifyStripeWebhook(stripe.webhooks, payload, header, SECRET).ok).toBe(false);
  });

  it("rejects old timestamps (replay protection)", () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const header = signedHeader(payload, SECRET, anHourAgo);
    expect(verifyStripeWebhook(stripe.webhooks, payload, header, SECRET).ok).toBe(false);
  });

  it("rejects a missing header or a missing secret", () => {
    expect(verifyStripeWebhook(stripe.webhooks, payload, null, SECRET)).toEqual({ ok: false, error: "Stripe-Signature mangler." });
    expect(verifyStripeWebhook(stripe.webhooks, payload, signedHeader(payload), "").ok).toBe(false);
    expect(verifyStripeWebhook(stripe.webhooks, payload, "t=1,v1=deadbeef", SECRET).ok).toBe(false);
  });
});
