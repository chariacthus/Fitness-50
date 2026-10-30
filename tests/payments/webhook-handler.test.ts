import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createFakeSupabase, type FakeSupabase, type Row } from "./fake-supabase";

// The webhook handler against an in-memory database. The database functions
// (_membership_state) are stubbed per test; the side effects are spies.

const state = vi.hoisted(() => ({ db: null as unknown }));
const effects = vi.hoisted(() => ({
  onMembershipActivated: vi.fn(),
  onMembershipCanceling: vi.fn(),
  onMembershipExpired: vi.fn(),
  onRenewalPaymentFailed: vi.fn(),
  onNutritionPurchased: vi.fn(),
  onDuplicateNutritionPurchase: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/payments/side-effects", () => effects);

const { processStripeEvent } = await import("@/lib/payments/webhook-handler");

const USER = "8f1c2d3e-4b5a-4c6d-9e7f-0a1b2c3d4e5f";
const KOSTPLAN = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
// 2026-10-30T10:00:00Z and one month later.
const PERIOD_START = 1793354400;
const PERIOD_END = 1795946400;

let db: FakeSupabase;
let stripeSubscriptions: Record<string, Row>;
const stripe = {
  subscriptions: { retrieve: vi.fn(async (id: string) => stripeSubscriptions[id]) },
} as unknown as Stripe;

let eventCounter = 0;
function event(type: string, object: Row, livemode = true, id = `evt_${++eventCounter}`) {
  return { id, object: "event", type, livemode, data: { object } } as unknown as Stripe.Event;
}

function subscription(overrides: Row = {}): Row {
  return {
    id: "sub_1",
    object: "subscription",
    status: "active",
    customer: "cus_1",
    livemode: true,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    metadata: { user_id: USER },
    items: {
      data: [
        {
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          quantity: 1,
          price: { id: "price_1", unit_amount: 29900, currency: "dkk", recurring: { interval: "month", interval_count: 1 } },
        },
      ],
    },
    ...overrides,
  };
}

function storedSubscription(overrides: Row = {}): Row {
  return {
    id: "row_sub_1",
    user_id: USER,
    product_id: null,
    provider: "stripe",
    provider_subscription_id: "sub_1",
    provider_customer_id: "cus_1",
    provider_price_id: "price_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    current_period_start: "2026-10-30T10:00:00+00:00",
    current_period_end: "2026-11-29T10:00:00+00:00",
    payment_failed_at: null,
    amount: 29900,
    billing_interval: "month",
    livemode: true,
    updated_at: "2026-10-30T10:00:00+00:00",
    ...overrides,
  };
}

function checkoutSession(overrides: Row = {}): Row {
  return {
    id: "cs_2",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    livemode: false,
    amount_total: 49900,
    payment_intent: "pi_2",
    metadata: { user_id: USER, product_id: KOSTPLAN },
    ...overrides,
  };
}

function purchase(overrides: Row): Row {
  return {
    user_id: USER,
    product_id: KOSTPLAN,
    provider: "stripe",
    amount: 49900,
    status: "pending",
    paid_at: null,
    provider_checkout_session_id: null,
    livemode: null,
    created_at: "2026-10-30T09:00:00+00:00",
    products: { slug: "kostplan" },
    ...overrides,
  };
}

/** Membership state derived from the stored rows, like a much simplified _membership_state(). */
function stateFromRows() {
  const sub = db.rows("subscriptions").find((row) => row.user_id === USER);
  if (!sub) return "none";
  if (sub.status === "active") return sub.cancel_at ? "canceling" : "active";
  if (sub.status === "past_due") return "past_due";
  return "expired";
}

function eventStatus(id: string) {
  return db.rows("payment_events").find((row) => row.provider_event_id === id)?.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  eventCounter = 0;
  stripeSubscriptions = { sub_1: subscription() };
  db = createFakeSupabase({ admin_settings: [{ id: 1, stripe_livemode: null, updated_at: "2026-10-01T00:00:00+00:00" }] });
  db.onRpc("_membership_state", stateFromRows);
  state.db = db;
});

describe("Stripe mode (admin_settings.stripe_livemode)", () => {
  it("is set from a verified event before the event is handled", async () => {
    db.rows("admin_settings")[0].stripe_livemode = false;
    const modesSeen: unknown[] = [];
    db.onRpc("_membership_state", () => {
      modesSeen.push(db.rows("admin_settings")[0].stripe_livemode);
      return stateFromRows();
    });

    const outcome = await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }, true));

    expect(outcome.status).toBe(200);
    expect(db.rows("admin_settings")[0].stripe_livemode).toBe(true);
    // The membership state was read in the new mode, so the live subscription counts.
    expect(modesSeen.length).toBeGreaterThan(0);
    expect(modesSeen.every((mode) => mode === true)).toBe(true);
  });

  it("is only written when it differs", async () => {
    await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }, true));
    const updatedAt = db.rows("admin_settings")[0].updated_at;
    await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }, true));
    expect(db.rows("admin_settings")[0].updated_at).toBe(updatedAt);
    expect(db.writes.filter((w) => w.table === "admin_settings" && w.matched > 0)).toHaveLength(1);

    // Back on test keys: test events switch it back.
    await processStripeEvent(stripe, event("charge.refunded", { id: "ch_1", payment_intent: null, refunded: true }, false));
    expect(db.rows("admin_settings")[0].stripe_livemode).toBe(false);
  });

  it("never blocks the event when it cannot be saved", async () => {
    db.failNext("admin_settings", "update", { message: "permission denied" });
    const outcome = await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }));
    expect(outcome.status).toBe(200);
    expect(db.rows("subscriptions")).toHaveLength(1);
  });
});

describe("subscription events", () => {
  it("stores the subscription's livemode", async () => {
    stripeSubscriptions.sub_1 = subscription({ livemode: false });
    await processStripeEvent(stripe, event("customer.subscription.created", { id: "sub_1" }, false));
    expect(db.rows("subscriptions")[0]).toMatchObject({ provider_subscription_id: "sub_1", livemode: false });
  });

  it("backfills livemode on a row stored before the column existed", async () => {
    db.tables.subscriptions = [storedSubscription({ livemode: null })];
    await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }));
    expect(db.rows("subscriptions")[0].livemode).toBe(true);
    expect(effects.onMembershipActivated).not.toHaveBeenCalled(); // same state – no messages
  });

  it("ignores an event for a deleted account instead of failing for days", async () => {
    db.failNext("subscriptions", "insert", {
      code: "23503",
      message: 'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_user_id_fkey"',
      details: `Key (user_id)=(${USER}) is not present in table "users".`,
    });
    const deleted = event("customer.subscription.deleted", subscription({ status: "canceled", ended_at: PERIOD_START }));

    const outcome = await processStripeEvent(stripe, deleted);

    expect(outcome).toEqual({ status: 200, body: { received: true } });
    expect(eventStatus(deleted.id)).toBe("ignored");
    expect(db.rows("subscriptions")).toHaveLength(0);
    expect(effects.onMembershipExpired).not.toHaveBeenCalled();
  });

  it("ignores a subscription that belongs to no user of this site", async () => {
    stripeSubscriptions.sub_1 = subscription({ metadata: {} });
    const updated = event("customer.subscription.updated", { id: "sub_1" });
    const outcome = await processStripeEvent(stripe, updated);
    expect(outcome.status).toBe(200);
    expect(eventStatus(updated.id)).toBe("ignored");
  });

  it("still fails (so Stripe retries) on other database errors", async () => {
    db.failNext("subscriptions", "insert", {
      code: "23503",
      message: 'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_product_id_fkey"',
      details: 'Key (product_id)=(x) is not present in table "products".',
    });
    const created = event("customer.subscription.created", { id: "sub_1" });
    const outcome = await processStripeEvent(stripe, created);
    expect(outcome.status).toBe(500);
    expect(eventStatus(created.id)).toBe("failed");
  });

  it("sends 'membership expired' once when Stripe ends a cancelled subscription at the period end", async () => {
    // Cancelled at period end, and the period end has passed: the time-derived
    // state already reads "expired" before Stripe's event arrives.
    db.tables.subscriptions = [
      storedSubscription({ cancel_at_period_end: true, cancel_at: "2026-10-01T10:00:00+00:00", current_period_end: "2026-10-01T10:00:00+00:00" }),
    ];
    db.onRpc("_membership_state", () => "expired");
    const ended = subscription({ status: "canceled", cancel_at_period_end: true, cancel_at: 1790848800, ended_at: 1790848800 });
    const deleted = event("customer.subscription.deleted", ended);

    expect((await processStripeEvent(stripe, deleted)).status).toBe(200);
    expect(effects.onMembershipExpired).toHaveBeenCalledTimes(1);
    expect(effects.onMembershipExpired).toHaveBeenCalledWith(USER);
    expect(db.rows("subscriptions")[0].status).toBe("canceled");

    // A retry of the same event and a later event with the same state send nothing more.
    stripeSubscriptions.sub_1 = ended;
    await processStripeEvent(stripe, deleted);
    await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }));
    expect(effects.onMembershipExpired).toHaveBeenCalledTimes(1);
    expect(effects.onMembershipActivated).not.toHaveBeenCalled();
  });

  it("sends 'membership expired' once when a past-due subscription is cancelled", async () => {
    db.tables.subscriptions = [storedSubscription({ status: "past_due" })];
    await processStripeEvent(stripe, event("customer.subscription.deleted", subscription({ status: "canceled" })));
    expect(effects.onMembershipExpired).toHaveBeenCalledTimes(1);
  });

  it("does not send 'membership expired' while another subscription keeps the member active", async () => {
    db.tables.subscriptions = [storedSubscription()];
    db.onRpc("_membership_state", () => "active");
    await processStripeEvent(stripe, event("customer.subscription.deleted", subscription({ status: "canceled" })));
    expect(effects.onMembershipExpired).not.toHaveBeenCalled();
  });

  it("names cancel_at as the end of access for a custom cancel date after the current period", async () => {
    db.tables.subscriptions = [storedSubscription()];
    const cancelAt = PERIOD_END + 60 * 86400; // two months after the current period
    stripeSubscriptions.sub_1 = subscription({ cancel_at: cancelAt });
    await processStripeEvent(stripe, event("customer.subscription.updated", { id: "sub_1" }));
    expect(effects.onMembershipCanceling).toHaveBeenCalledTimes(1);
    expect(effects.onMembershipCanceling).toHaveBeenCalledWith(db, USER, new Date(cancelAt * 1000).toISOString());
  });
});

describe("nutrition purchases", () => {
  it("first payment: stores livemode and starts the nutrition flow", async () => {
    db.tables.purchases = [purchase({ id: "p_2", provider_checkout_session_id: "cs_2" })];

    const outcome = await processStripeEvent(stripe, event("checkout.session.completed", checkoutSession(), false));

    expect(outcome.status).toBe(200);
    expect(db.rows("purchases")[0]).toMatchObject({ status: "paid", livemode: false, provider_payment_intent_id: "pi_2" });
    expect(effects.onNutritionPurchased).toHaveBeenCalledTimes(1);
    expect(effects.onDuplicateNutritionPurchase).not.toHaveBeenCalled();
  });

  it("a second payment for a plan the member already has notifies the administrators instead", async () => {
    db.tables.purchases = [
      purchase({ id: "p_1", status: "paid", paid_at: "2026-10-30T09:05:00+00:00", provider_checkout_session_id: "cs_1" }),
      purchase({ id: "p_2", provider_checkout_session_id: "cs_2" }),
    ];

    await processStripeEvent(stripe, event("checkout.session.completed", checkoutSession(), false));

    expect(db.rows("purchases").find((row) => row.id === "p_2")).toMatchObject({ status: "paid", livemode: false });
    expect(effects.onNutritionPurchased).not.toHaveBeenCalled();
    expect(effects.onDuplicateNutritionPurchase).toHaveBeenCalledTimes(1);
    expect(effects.onDuplicateNutritionPurchase).toHaveBeenCalledWith(db, USER);
  });

  it("a manual grant counts as already having the plan", async () => {
    db.tables.purchases = [
      purchase({ id: "p_1", provider: "manual", status: "granted", created_at: "2026-10-01T09:00:00+00:00" }),
      purchase({ id: "p_2", provider_checkout_session_id: "cs_2" }),
    ];
    await processStripeEvent(stripe, event("checkout.session.completed", checkoutSession(), false));
    expect(effects.onDuplicateNutritionPurchase).toHaveBeenCalledTimes(1);
    expect(effects.onNutritionPurchased).not.toHaveBeenCalled();
  });

  it("a refunded or failed earlier purchase is not a duplicate", async () => {
    db.tables.purchases = [
      purchase({ id: "p_0", status: "refunded", paid_at: "2026-10-20T09:05:00+00:00" }),
      purchase({ id: "p_1", status: "failed" }),
      purchase({ id: "p_2", provider_checkout_session_id: "cs_2" }),
    ];
    await processStripeEvent(stripe, event("checkout.session.completed", checkoutSession(), false));
    expect(effects.onNutritionPurchased).toHaveBeenCalledTimes(1);
    expect(effects.onDuplicateNutritionPurchase).not.toHaveBeenCalled();
  });

  it("stores livemode on an expired payment page", async () => {
    db.tables.purchases = [purchase({ id: "p_2", provider_checkout_session_id: "cs_2" })];
    await processStripeEvent(
      stripe,
      event("checkout.session.expired", checkoutSession({ status: "expired", payment_status: "unpaid" }), false),
    );
    expect(db.rows("purchases")[0]).toMatchObject({ status: "canceled", livemode: false });
    expect(effects.onNutritionPurchased).not.toHaveBeenCalled();
  });
});
