import "server-only";
import type Stripe from "stripe";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customers";
import type { CheckoutProduct } from "@/lib/payments/checkout-context";

// Creates Stripe Checkout Sessions. Nothing here grants access: the session
// only leads to Stripe's payment page, and the webhook records the outcome.

type Buyer = { userId: string; email: string | null };

/** Subscription checkout for the membership (cards only – MobilePay cannot renew automatically). */
export async function createMembershipCheckout(stripe: Stripe, buyer: Buyer, product: CheckoutProduct): Promise<string | null> {
  const customer = await getOrCreateStripeCustomer(stripe, buyer.userId, buyer.email);
  const metadata = { user_id: buyer.userId, product_id: product.id };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: buyer.userId,
    line_items: [{ price: product.stripe_price_id!, quantity: 1 }],
    // This API version uses `allowed_payment_method_types` (formerly `payment_method_types`).
    allowed_payment_method_types: ["card"],
    locale: "da",
    success_url: `${publicEnv.siteUrl}/bliv-medlem/bekraeftelse?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicEnv.siteUrl}/bliv-medlem/annulleret`,
    metadata,
    subscription_data: { metadata },
  });
  return session.url;
}

/**
 * One-time checkout for an add-on. A pending purchase row is created first
 * (service role – purchases cannot be written by members) and linked to the session.
 */
export async function createAddonCheckout(
  stripe: Stripe,
  buyer: Buyer,
  product: CheckoutProduct,
  paths: { success: string; cancel: string },
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({
      user_id: buyer.userId,
      product_id: product.id,
      provider: "stripe",
      amount: product.price_amount,
      currency: "dkk",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !purchase) throw new Error(`purchases: ${error?.message ?? "insert failed"}`);

  try {
    const customer = await getOrCreateStripeCustomer(stripe, buyer.userId, buyer.email);
    const metadata = { user_id: buyer.userId, product_id: product.id, purchase_id: purchase.id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: product.mobilepay_enabled ? ["card", "mobilepay"] : ["card"],
      line_items: [{ price: product.stripe_price_id!, quantity: 1 }],
      customer,
      client_reference_id: buyer.userId,
      locale: "da",
      metadata,
      payment_intent_data: { metadata },
      success_url: `${publicEnv.siteUrl}${paths.success}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicEnv.siteUrl}${paths.cancel}`,
    });

    const { error: linkError } = await admin
      .from("purchases")
      .update({ provider_checkout_session_id: session.id })
      .eq("id", purchase.id);
    // The webhook can still find the purchase through metadata.purchase_id.
    if (linkError) console.warn("[checkout] kunne ikke gemme session-id på købet", purchase.id, linkError.message);
    return session.url;
  } catch (err) {
    await admin
      .from("purchases")
      .update({ status: "canceled", note: "Betalingssiden kunne ikke oprettes." })
      .eq("id", purchase.id)
      .eq("status", "pending");
    throw err;
  }
}
