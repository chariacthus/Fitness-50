import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { isDuplicatePurchase, metadataUuid, stripeId, subscriptionIdFromInvoice } from "@/lib/payments/stripe-mapping";
import { onDuplicateNutritionPurchase, onNutritionPurchased, onRenewalPaymentFailed } from "@/lib/payments/side-effects";
import { syncSubscription } from "@/lib/payments/subscription-sync";

// Processes verified Stripe webhook events. This is the ONLY place where
// payment state changes – the browser is never trusted.

type AdminClient = ReturnType<typeof createAdminClient>;
type Ctx = { admin: AdminClient; stripe: Stripe };
type HandlerResult = { ignored?: boolean; userId?: string | null };

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

/** Stripe event types this endpoint acts on (configure exactly these in the Stripe Dashboard). */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
] as const;

/**
 * Remembers which Stripe mode (live or test) the site runs in, from the mode of
 * signature-verified events. _membership_state() and _has_addon() then ignore
 * subscriptions and purchases from the other mode, e.g. test purchases after
 * the switch to live keys. Best effort: it never blocks the event itself.
 */
async function rememberStripeMode(admin: AdminClient, livemode: boolean) {
  try {
    const { error } = await admin
      .from("admin_settings")
      .update({ stripe_livemode: livemode })
      .eq("id", 1)
      .not("stripe_livemode", "is", livemode); // only when it differs (or is unknown)
    if (error) console.warn("[stripe-webhook] kunne ikke gemme Stripe-tilstanden", error.message);
  } catch (error) {
    console.warn("[stripe-webhook] kunne ikke gemme Stripe-tilstanden", error instanceof Error ? error.message : error);
  }
}

async function recordEvent(admin: AdminClient, event: Stripe.Event): Promise<{ id: string; alreadyHandled: boolean }> {
  const { data: inserted, error } = await admin
    .from("payment_events")
    .upsert(
      {
        provider: "stripe",
        provider_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payload: event as unknown as Json,
        status: "received",
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("id, status");
  if (error) throw new Error(`payment_events: ${error.message}`);
  if (inserted && inserted.length > 0) return { id: inserted[0].id, alreadyHandled: false };

  const { data: existing, error: readError } = await admin
    .from("payment_events")
    .select("id, status")
    .eq("provider", "stripe")
    .eq("provider_event_id", event.id)
    .single();
  if (readError || !existing) throw new Error(`payment_events: ${readError?.message ?? "not found"}`);
  // processed/ignored → done. received/failed → process again (an earlier attempt crashed or failed).
  return { id: existing.id, alreadyHandled: existing.status === "processed" || existing.status === "ignored" };
}

async function finishEvent(
  admin: AdminClient,
  id: string,
  status: "processed" | "ignored" | "failed",
  userId: string | null | undefined,
  error: string | null,
) {
  await admin
    .from("payment_events")
    .update({
      status,
      error,
      processed_at: new Date().toISOString(),
      ...(userId ? { user_id: userId } : {}),
    })
    .eq("id", id);
}

// --- Checkout --------------------------------------------------------------

async function findPurchase(admin: AdminClient, session: Stripe.Checkout.Session) {
  const select = "id, user_id, product_id, status, amount, products(slug)";
  const { data: bySession, error } = await admin
    .from("purchases")
    .select(select)
    .eq("provider_checkout_session_id", session.id)
    .maybeSingle();
  if (error) throw new Error(`purchases: ${error.message}`);
  if (bySession) return bySession;
  const purchaseId = metadataUuid(session.metadata, "purchase_id");
  if (!purchaseId) return null;
  const { data: byId, error: idError } = await admin.from("purchases").select(select).eq("id", purchaseId).maybeSingle();
  if (idError) throw new Error(`purchases: ${idError.message}`);
  return byId;
}

/** True when the user already had a paid or granted purchase of this product before this payment. */
async function alreadyPurchased(admin: AdminClient, purchase: { id: string; user_id: string; product_id: string }, paidAt: string) {
  const { data, error } = await admin
    .from("purchases")
    .select("id, paid_at, created_at")
    .eq("user_id", purchase.user_id)
    .eq("product_id", purchase.product_id)
    .in("status", ["paid", "granted"])
    .neq("id", purchase.id);
  if (error) {
    // The purchase is already marked as paid – notify as usual rather than not at all.
    console.warn("[stripe-webhook] kunne ikke tjekke for dobbeltkøb", purchase.id, error.message);
    return false;
  }
  return isDuplicatePurchase({ id: purchase.id, paid_at: paidAt }, data ?? []);
}

async function handlePurchaseSession(ctx: Ctx, session: Stripe.Checkout.Session, type: string): Promise<HandlerResult> {
  const purchase = await findPurchase(ctx.admin, session);
  if (!purchase) {
    if (metadataUuid(session.metadata, "purchase_id")) {
      throw new Error(`Købet for checkout-session ${session.id} blev ikke fundet.`);
    }
    return { ignored: true }; // not created by this site
  }
  const metadataUser = metadataUuid(session.metadata, "user_id");
  if (metadataUser && metadataUser !== purchase.user_id) {
    throw new Error(`Checkout-session ${session.id} tilhører en anden bruger end købet.`);
  }

  const paymentIntentId = stripeId(session.payment_intent);
  const livemode = session.livemode;
  const now = new Date().toISOString();

  if (type === "checkout.session.async_payment_failed") {
    const { error } = await ctx.admin
      .from("purchases")
      .update({ status: "failed", provider_checkout_session_id: session.id, provider_payment_intent_id: paymentIntentId, livemode })
      .eq("id", purchase.id)
      .in("status", ["pending", "canceled"]);
    if (error) throw new Error(`purchases: ${error.message}`);
    return { userId: purchase.user_id };
  }

  if (type === "checkout.session.expired") {
    const { error } = await ctx.admin.from("purchases").update({ status: "canceled", livemode }).eq("id", purchase.id).eq("status", "pending");
    if (error) throw new Error(`purchases: ${error.message}`);
    return { userId: purchase.user_id };
  }

  // checkout.session.completed / async_payment_succeeded
  if (session.payment_status !== "paid") {
    // An asynchronous payment method is still processing; wait for async_payment_succeeded/failed.
    const { error } = await ctx.admin
      .from("purchases")
      .update({ provider_checkout_session_id: session.id, provider_payment_intent_id: paymentIntentId, livemode })
      .eq("id", purchase.id);
    if (error) throw new Error(`purchases: ${error.message}`);
    return { userId: purchase.user_id };
  }

  // Conditional update: only one delivery turns the purchase into "paid" (and notifies).
  const { data: paid, error } = await ctx.admin
    .from("purchases")
    .update({
      status: "paid",
      paid_at: now,
      provider_checkout_session_id: session.id,
      provider_payment_intent_id: paymentIntentId,
      amount: session.amount_total ?? purchase.amount,
      livemode,
    })
    .eq("id", purchase.id)
    .in("status", ["pending", "failed", "canceled"])
    .select("id");
  if (error) throw new Error(`purchases: ${error.message}`);

  const slug = (purchase.products as { slug: string } | null)?.slug;
  if (paid && paid.length > 0 && slug === "kostplan") {
    // A second payment for a plan the member already has must not start the
    // nutrition flow again – the administrators are asked to refund it instead.
    if (await alreadyPurchased(ctx.admin, purchase, now)) await onDuplicateNutritionPurchase(ctx.admin, purchase.user_id);
    else await onNutritionPurchased(ctx.admin, purchase.user_id);
  }
  return { userId: purchase.user_id };
}

/** Result of a subscription sync: ignored when the subscription belongs to no (longer existing) user. */
function synced(userId: string | null): HandlerResult {
  return userId ? { userId } : { ignored: true };
}

async function handleCheckoutSession(ctx: Ctx, session: Stripe.Checkout.Session, type: string): Promise<HandlerResult> {
  if (session.mode === "payment") return handlePurchaseSession(ctx, session, type);
  if (session.mode !== "subscription" || type === "checkout.session.expired") return { ignored: true };

  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) return { ignored: true };
  const hintUserId = metadataUuid(session.metadata, "user_id");
  const latest = await ctx.stripe.subscriptions.retrieve(subscriptionId);
  return synced(await syncSubscription(ctx.admin, latest, { userId: hintUserId }));
}

// --- Invoices ----------------------------------------------------------------

async function handleInvoicePaymentFailed(ctx: Ctx, invoice: Stripe.Invoice): Promise<HandlerResult> {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return { ignored: true };
  const latest = await ctx.stripe.subscriptions.retrieve(subscriptionId);
  const userId = await syncSubscription(ctx.admin, latest);
  if (!userId) return { ignored: true };

  // The very first payment is handled on the Checkout page itself.
  if (invoice.billing_reason === "subscription_create") return { userId };
  if (latest.status !== "past_due" && latest.status !== "unpaid") return { userId };

  // Only the first failure of a dunning cycle sets the date (and notifies) –
  // Stripe retries several times, and members should not get a message per attempt.
  const { data: marked, error } = await ctx.admin
    .from("subscriptions")
    .update({ payment_failed_at: new Date().toISOString() })
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscriptionId)
    .is("payment_failed_at", null)
    .select("id");
  if (error) throw new Error(`subscriptions: ${error.message}`);
  if (marked && marked.length > 0) await onRenewalPaymentFailed(ctx.admin, userId);
  return { userId };
}

async function handleInvoicePaid(ctx: Ctx, invoice: Stripe.Invoice): Promise<HandlerResult> {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return { ignored: true };
  const latest = await ctx.stripe.subscriptions.retrieve(subscriptionId);
  const userId = await syncSubscription(ctx.admin, latest);
  if (!userId) return { ignored: true };
  const { error } = await ctx.admin
    .from("subscriptions")
    .update({ payment_failed_at: null })
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscriptionId)
    .not("payment_failed_at", "is", null);
  if (error) throw new Error(`subscriptions: ${error.message}`);
  return { userId };
}

// --- Refunds -----------------------------------------------------------------

async function handleChargeRefunded(ctx: Ctx, charge: Stripe.Charge): Promise<HandlerResult> {
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return { ignored: true };
  const { data: purchase, error } = await ctx.admin
    .from("purchases")
    .select("id, user_id, status")
    .eq("provider", "stripe")
    .eq("provider_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error(`purchases: ${error.message}`);
  if (!purchase) return { ignored: true }; // e.g. a refunded membership invoice
  // Partial refunds keep the purchase (and access) as paid.
  if (!charge.refunded) return { userId: purchase.user_id };

  const { error: updateError } = await ctx.admin
    .from("purchases")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", purchase.id)
    .eq("status", "paid");
  if (updateError) throw new Error(`purchases: ${updateError.message}`);
  return { userId: purchase.user_id };
}

// --- Dispatch ------------------------------------------------------------------

async function handleEvent(ctx: Ctx, event: Stripe.Event): Promise<HandlerResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return handleCheckoutSession(ctx, event.data.object, event.type);

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      // Events can arrive out of order – always store the latest state from Stripe.
      const latest = await ctx.stripe.subscriptions.retrieve(event.data.object.id);
      return synced(await syncSubscription(ctx.admin, latest));
    }

    case "customer.subscription.deleted":
      // The event carries the final state of the ended subscription.
      return synced(await syncSubscription(ctx.admin, event.data.object));

    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(ctx, event.data.object);

    case "invoice.paid":
      return handleInvoicePaid(ctx, event.data.object);

    case "charge.refunded":
      return handleChargeRefunded(ctx, event.data.object);

    default:
      return { ignored: true };
  }
}

/**
 * Stores the event once (idempotency), processes it and records the outcome.
 * A failure returns 500 so Stripe retries the delivery later.
 */
export async function processStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<WebhookOutcome> {
  let admin: AdminClient;
  let recordId: string;
  try {
    admin = createAdminClient();
    // Before the event is handled: the membership state read while handling it
    // depends on the mode.
    await rememberStripeMode(admin, event.livemode);
    const record = await recordEvent(admin, event);
    if (record.alreadyHandled) return { status: 200, body: { received: true, duplicate: true } };
    recordId = record.id;
  } catch (error) {
    console.error("[stripe-webhook] kunne ikke gemme hændelsen", event.id, error instanceof Error ? error.message : error);
    return { status: 500, body: { error: "event_not_stored" } };
  }

  try {
    const result = await handleEvent({ admin, stripe }, event);
    await finishEvent(admin, recordId, result.ignored ? "ignored" : "processed", result.userId, null);
    return { status: 200, body: { received: true } };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    console.error("[stripe-webhook] behandling fejlede", event.type, event.id, message);
    try {
      await finishEvent(admin, recordId, "failed", null, message);
    } catch {
      // The event stays "received" and is processed again on Stripe's retry.
    }
    return { status: 500, body: { error: "processing_failed" } };
  }
}
