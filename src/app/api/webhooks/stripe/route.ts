import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { verifyStripeWebhook } from "@/lib/stripe/webhook";
import { isStripeConfigured, serverEnv } from "@/lib/server-env";
import { processStripeEvent } from "@/lib/payments/webhook-handler";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Stripe webhook endpoint. Excluded from the session proxy (src/proxy.ts).
 * Only signature-verified events can change payment state.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503, headers: NO_STORE });
  }

  // The signature covers the exact raw body – read it as text, never as JSON.
  const body = await request.text();
  const verification = verifyStripeWebhook(
    stripe.webhooks,
    body,
    request.headers.get("stripe-signature"),
    serverEnv.stripeWebhookSecret,
  );
  if (!verification.ok) {
    console.warn("[stripe-webhook] afvist:", verification.error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400, headers: NO_STORE });
  }

  const outcome = await processStripeEvent(stripe, verification.event);
  return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
}
