import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  accessEndsAt,
  billingIntervalFromRecurring,
  isUuid,
  mapStripeSubscription,
  mapSubscriptionStatus,
  metadataUuid,
  priceMatches,
  recurringParamsForInterval,
  sameSubscriptionValues,
  stripeId,
  subscriptionIdFromInvoice,
  subscriptionPeriod,
  type SubscriptionLike,
} from "@/lib/payments/stripe-mapping";

const USER_ID = "8f1c2d3e-4b5a-4c6d-9e7f-0a1b2c3d4e5f";
const PRODUCT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

// 2026-10-30T10:00:00Z and one month later.
const PERIOD_START = 1793354400;
const PERIOD_END = 1795946400;

/** Subscription in the current API shape: periods on the items. */
function newShapeSubscription(overrides: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: "sub_1QnewShape",
    status: "active",
    customer: "cus_RealCustomer1",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    metadata: { user_id: USER_ID, product_id: PRODUCT_ID },
    items: {
      data: [
        {
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          quantity: 1,
          price: { id: "price_1Monthly", unit_amount: 29900, currency: "dkk", recurring: { interval: "month", interval_count: 1 } },
        },
      ],
    },
    ...overrides,
  };
}

/** Subscription as sent by webhook endpoints on API versions before 2025-03-31. */
function oldShapeSubscription(): SubscriptionLike {
  return {
    id: "sub_0OldShape",
    status: "past_due",
    customer: { id: "cus_ExpandedCustomer" },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    metadata: {},
    items: {
      data: [
        {
          quantity: 1,
          price: { id: "price_0Quarterly", unit_amount: 79900, currency: "dkk", recurring: { interval: "month", interval_count: 3 } },
        },
      ],
    },
  };
}

describe("mapStripeSubscription", () => {
  it("maps the current API shape with periods on the subscription items", () => {
    expect(mapStripeSubscription(newShapeSubscription())).toEqual({
      provider_subscription_id: "sub_1QnewShape",
      provider_customer_id: "cus_RealCustomer1",
      provider_price_id: "price_1Monthly",
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      current_period_start: "2026-10-30T10:00:00.000Z",
      current_period_end: "2026-11-29T10:00:00.000Z",
      amount: 29900,
      billing_interval: "month",
    });
  });

  it("maps the old API shape with top-level periods and an expanded customer", () => {
    const mapped = mapStripeSubscription(oldShapeSubscription());
    expect(mapped.provider_customer_id).toBe("cus_ExpandedCustomer");
    expect(mapped.current_period_start).toBe("2026-10-30T10:00:00.000Z");
    expect(mapped.current_period_end).toBe("2026-11-29T10:00:00.000Z");
    expect(mapped.status).toBe("past_due");
    expect(mapped.billing_interval).toBe("quarter");
    expect(mapped.amount).toBe(79900);
  });

  it("maps cancellation fields", () => {
    const mapped = mapStripeSubscription(
      newShapeSubscription({ cancel_at_period_end: true, cancel_at: PERIOD_END, canceled_at: PERIOD_START + 3600 }),
    );
    expect(mapped.cancel_at_period_end).toBe(true);
    expect(mapped.cancel_at).toBe("2026-11-29T10:00:00.000Z");
    expect(mapped.canceled_at).toBe("2026-10-30T11:00:00.000Z");
  });

  it("maps an ended subscription (customer.subscription.deleted)", () => {
    const mapped = mapStripeSubscription(newShapeSubscription({ status: "canceled", ended_at: PERIOD_END, canceled_at: PERIOD_END }));
    expect(mapped.status).toBe("canceled");
    expect(mapped.ended_at).toBe("2026-11-29T10:00:00.000Z");
  });

  it("multiplies the amount by quantity and survives missing items", () => {
    const sub = newShapeSubscription();
    sub.items!.data![0].quantity = 2;
    expect(mapStripeSubscription(sub).amount).toBe(59800);
    const empty = mapStripeSubscription({ id: "sub_x", status: "incomplete", customer: null, items: { data: [] } });
    expect(empty).toMatchObject({ provider_price_id: null, amount: null, billing_interval: null, current_period_end: null });
  });

  it("accepts a real Stripe.Subscription type", () => {
    // Compile-time check: the SDK type is assignable to the mapper input.
    const accept = (s: Stripe.Subscription) => mapStripeSubscription(s);
    expect(typeof accept).toBe("function");
  });
});

describe("subscriptionPeriod", () => {
  it("prefers item periods over legacy top-level fields", () => {
    const sub = newShapeSubscription({ current_period_start: 1, current_period_end: 2 });
    expect(subscriptionPeriod(sub).end).toBe("2026-11-29T10:00:00.000Z");
  });
});

describe("mapSubscriptionStatus", () => {
  it("keeps known statuses", () => {
    for (const status of ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]) {
      expect(mapSubscriptionStatus(status)).toBe(status);
    }
  });
  it("treats unknown statuses as unpaid (never grants access)", () => {
    expect(mapSubscriptionStatus("some_future_status")).toBe("unpaid");
  });
});

describe("billing intervals", () => {
  it("maps Stripe recurring settings to our intervals", () => {
    expect(billingIntervalFromRecurring({ interval: "month", interval_count: 1 })).toBe("month");
    expect(billingIntervalFromRecurring({ interval: "month", interval_count: 3 })).toBe("quarter");
    expect(billingIntervalFromRecurring({ interval: "month", interval_count: 12 })).toBe("year");
    expect(billingIntervalFromRecurring({ interval: "year", interval_count: 1 })).toBe("year");
    expect(billingIntervalFromRecurring({ interval: "month" })).toBe("month");
    expect(billingIntervalFromRecurring({ interval: "week", interval_count: 2 })).toBeNull();
    expect(billingIntervalFromRecurring(null)).toBeNull();
  });

  it("maps our intervals to Stripe recurring params", () => {
    expect(recurringParamsForInterval("month")).toEqual({ interval: "month", interval_count: 1 });
    expect(recurringParamsForInterval("quarter")).toEqual({ interval: "month", interval_count: 3 });
    expect(recurringParamsForInterval("year")).toEqual({ interval: "year", interval_count: 1 });
    expect(recurringParamsForInterval("one_time")).toBeNull();
  });

  it("round-trips every membership interval", () => {
    for (const interval of ["month", "quarter", "year"]) {
      expect(billingIntervalFromRecurring(recurringParamsForInterval(interval))).toBe(interval);
    }
  });
});

describe("priceMatches", () => {
  const monthly = { id: "price_1", active: true, unit_amount: 29900, currency: "dkk", recurring: { interval: "month", interval_count: 1 } };
  it("matches amount, currency and interval", () => {
    expect(priceMatches(monthly, { amount: 29900, interval: "month" })).toBe(true);
    expect(priceMatches(monthly, { amount: 19900, interval: "month" })).toBe(false);
    expect(priceMatches(monthly, { amount: 29900, interval: "quarter" })).toBe(false);
    expect(priceMatches({ ...monthly, active: false }, { amount: 29900, interval: "month" })).toBe(false);
    expect(priceMatches({ ...monthly, currency: "eur" }, { amount: 29900, interval: "month" })).toBe(false);
  });
  it("one-time prices must not be recurring", () => {
    const oneTime = { id: "price_2", active: true, unit_amount: 4900, currency: "dkk", recurring: null };
    expect(priceMatches(oneTime, { amount: 4900, interval: "one_time" })).toBe(true);
    expect(priceMatches(monthly, { amount: 29900, interval: "one_time" })).toBe(false);
  });
});

describe("subscriptionIdFromInvoice", () => {
  it("reads the current shape (invoice.parent.subscription_details)", () => {
    expect(
      subscriptionIdFromInvoice({
        id: "in_new",
        parent: { subscription_details: { subscription: "sub_1QnewShape" } },
      }),
    ).toBe("sub_1QnewShape");
  });
  it("reads an expanded subscription object in the parent", () => {
    expect(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: { id: "sub_exp" } } } })).toBe("sub_exp");
  });
  it("reads the old top-level invoice.subscription", () => {
    expect(subscriptionIdFromInvoice({ id: "in_old", subscription: "sub_0OldShape" })).toBe("sub_0OldShape");
  });
  it("falls back to the invoice lines", () => {
    expect(
      subscriptionIdFromInvoice({
        parent: null,
        lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_fromLine" } } }] },
      }),
    ).toBe("sub_fromLine");
    expect(subscriptionIdFromInvoice({ lines: { data: [{ subscription: "sub_oldLine" }] } })).toBe("sub_oldLine");
  });
  it("returns null for one-off invoices", () => {
    expect(subscriptionIdFromInvoice({ id: "in_oneoff", parent: null, lines: { data: [] } })).toBeNull();
  });
});

describe("helpers", () => {
  it("stripeId handles ids, objects and empty values", () => {
    expect(stripeId("cus_1")).toBe("cus_1");
    expect(stripeId({ id: "cus_2" })).toBe("cus_2");
    expect(stripeId(null)).toBeNull();
    expect(stripeId("")).toBeNull();
  });

  it("metadataUuid only accepts uuids", () => {
    expect(metadataUuid({ user_id: USER_ID }, "user_id")).toBe(USER_ID);
    expect(metadataUuid({ user_id: USER_ID.toUpperCase() }, "user_id")).toBe(USER_ID);
    expect(metadataUuid({ user_id: "'; drop table users;--" }, "user_id")).toBeNull();
    expect(metadataUuid(null, "user_id")).toBeNull();
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("accessEndsAt picks the earliest of cancel_at and period end", () => {
    expect(accessEndsAt({ cancel_at: "2026-11-15T00:00:00.000Z", current_period_end: "2026-11-29T10:00:00.000Z" })).toBe(
      "2026-11-15T00:00:00.000Z",
    );
    expect(accessEndsAt({ cancel_at: null, current_period_end: "2026-11-29T10:00:00.000Z" })).toBe("2026-11-29T10:00:00.000Z");
    expect(accessEndsAt({ cancel_at: null, current_period_end: null })).toBeNull();
  });

  it("sameSubscriptionValues compares timestamps as instants", () => {
    const mapped = mapStripeSubscription(newShapeSubscription());
    const dbRow = {
      ...mapped,
      user_id: USER_ID,
      product_id: PRODUCT_ID,
      current_period_start: "2026-10-30T10:00:00+00:00",
      current_period_end: "2026-11-29T10:00:00+00:00",
    };
    expect(sameSubscriptionValues(dbRow, { ...mapped, user_id: USER_ID, product_id: PRODUCT_ID })).toBe(true);
    expect(sameSubscriptionValues(dbRow, { ...mapped, user_id: USER_ID, product_id: PRODUCT_ID, status: "past_due" })).toBe(false);
    expect(sameSubscriptionValues({ ...dbRow, payment_failed_at: "2026-11-01T00:00:00+00:00" } as never, { payment_failed_at: null } as never)).toBe(
      false,
    );
  });
});
