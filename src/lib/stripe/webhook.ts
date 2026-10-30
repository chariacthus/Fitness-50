import type Stripe from "stripe";

export type WebhookVerification =
  | { ok: true; event: Stripe.Event }
  | { ok: false; error: string };

/**
 * Verifies the Stripe-Signature header against the raw request body.
 * The body must be the exact bytes Stripe sent (`await request.text()`),
 * never a re-serialised JSON object.
 */
export function verifyStripeWebhook(
  webhooks: Pick<Stripe["webhooks"], "constructEvent">,
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): WebhookVerification {
  if (!secret) return { ok: false, error: "Webhook-nøglen er ikke sat." };
  if (!signature) return { ok: false, error: "Stripe-Signature mangler." };
  try {
    return { ok: true, event: webhooks.constructEvent(rawBody, signature, secret) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Ugyldig signatur." };
  }
}
