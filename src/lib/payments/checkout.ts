import "server-only";
import type Stripe from "stripe";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customers";
import { isMissingResource } from "@/lib/stripe/errors";
import type { CheckoutProduct } from "@/lib/payments/checkout-context";
import { membershipCheckoutBlock, type MembershipCheckoutBlock } from "@/lib/payments/stripe-mapping";

// Creates Stripe Checkout Sessions. Nothing here grants access: the session
// only leads to Stripe's payment page, and the webhook records the outcome.

type Buyer = { userId: string; email: string | null };
type AdminClient = ReturnType<typeof createAdminClient>;

/** Stripe's payment page, or a Danish reason why no new payment may be started. */
export type CheckoutStart = { url: string | null } | { refused: string };

const MEMBERSHIP_REFUSALS: Record<MembershipCheckoutBlock, string> = {
  active:
    "Du har allerede et medlemskab, så du skal ikke betale igen. Kan du ikke se det endnu, så vent et øjeblik, og genindlæs siden.",
  past_due:
    "Din seneste betaling mislykkedes. Opdater dit betalingskort under Min profil i stedet for at starte et nyt medlemskab.",
  pending: "Vi venter stadig på bekræftelse af din betaling. Vent et øjeblik, og genindlæs siden.",
};

const ADDON_AWAITING_PAYMENT =
  "Vi venter stadig på bekræftelse af din betaling for kostplanen. Vent et øjeblik, og genindlæs siden, før du prøver igen.";

/**
 * Closes an open Checkout Session so it can no longer be paid. Returns the
 * session's status afterwards: "expired", or "complete" when it was paid in
 * the meantime. Only a session that stays open is an error.
 */
async function expireSession(stripe: Stripe, id: string): Promise<Stripe.Checkout.Session.Status | null> {
  try {
    return (await stripe.checkout.sessions.expire(id)).status;
  } catch (error) {
    const current = await stripe.checkout.sessions.retrieve(id);
    if (current.status === "open") throw error;
    return current.status;
  }
}

/** Subscription checkout for the membership (cards only – MobilePay cannot renew automatically). */
export async function createMembershipCheckout(stripe: Stripe, buyer: Buyer, product: CheckoutProduct): Promise<CheckoutStart> {
  const customer = await getOrCreateStripeCustomer(stripe, buyer.userId, buyer.email);

  // A member pays for one subscription at most (two tabs, Back from Stripe, a
  // slow webhook). Earlier membership payment pages are closed first, so none
  // of them can be paid while this one is open; then any subscription that
  // already runs in Stripe – also one the webhook has not stored yet – stops a
  // new one. A page paid just before it was closed shows up in that list.
  const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
  for (const session of open.data) {
    if (session.mode === "subscription") await expireSession(stripe, session.id);
  }
  const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  const block = membershipCheckoutBlock(subscriptions.data.map((s) => s.status));
  if (block) return { refused: MEMBERSHIP_REFUSALS[block] };

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
  return { url: session.url };
}

/**
 * Closes the user's earlier, unpaid payment pages for this add-on (two tabs,
 * Back from Stripe), so he cannot pay for it twice. Returns a Danish reason
 * when one of them has already been paid and only waits for the webhook.
 */
async function closeEarlierAddonCheckouts(stripe: Stripe, admin: AdminClient, userId: string, productId: string) {
  const { data: pending, error } = await admin
    .from("purchases")
    .select("id, provider_checkout_session_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("provider", "stripe")
    .eq("status", "pending")
    .not("provider_checkout_session_id", "is", null);
  if (error) throw new Error(`purchases: ${error.message}`);

  for (const purchase of pending ?? []) {
    const sessionId = purchase.provider_checkout_session_id;
    if (!sessionId) continue;
    let status: Stripe.Checkout.Session.Status | null;
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      status = session.status === "open" ? await expireSession(stripe, sessionId) : session.status;
    } catch (err) {
      if (isMissingResource(err)) continue; // from the other Stripe mode (test vs. live) – cannot be paid here
      throw err;
    }
    if (status === "complete") return ADDON_AWAITING_PAYMENT;
    // The page can no longer be paid (the checkout.session.expired webhook does the same).
    const { error: cancelError } = await admin
      .from("purchases")
      .update({ status: "canceled" })
      .eq("id", purchase.id)
      .eq("status", "pending");
    if (cancelError) console.warn("[checkout] kunne ikke annullere det gamle køb", purchase.id, cancelError.message);
  }
  return null;
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
): Promise<CheckoutStart> {
  const admin = createAdminClient();
  const refused = await closeEarlierAddonCheckouts(stripe, admin, buyer.userId, product.id);
  if (refused) return { refused };

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
      .update({ provider_checkout_session_id: session.id, livemode: session.livemode })
      .eq("id", purchase.id);
    // The webhook can still find the purchase through metadata.purchase_id.
    if (linkError) console.warn("[checkout] kunne ikke gemme session-id på købet", purchase.id, linkError.message);
    return { url: session.url };
  } catch (err) {
    await admin
      .from("purchases")
      .update({ status: "canceled", note: "Betalingssiden kunne ikke oprettes." })
      .eq("id", purchase.id)
      .eq("status", "pending");
    throw err;
  }
}
