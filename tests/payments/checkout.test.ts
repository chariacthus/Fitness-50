import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { CheckoutProduct } from "@/lib/payments/checkout-context";
import { createFakeSupabase, type FakeSupabase, type Row } from "./fake-supabase";

// Checkout Session creation with a fake Stripe and an in-memory database:
// a member must never be able to pay for the same thing twice.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/stripe/customers", () => ({ getOrCreateStripeCustomer: vi.fn(async () => "cus_1") }));

const { createAddonCheckout, createMembershipCheckout } = await import("@/lib/payments/checkout");

const USER = "8f1c2d3e-4b5a-4c6d-9e7f-0a1b2c3d4e5f";
const OTHER_USER = "9a1c2d3e-4b5a-4c6d-9e7f-0a1b2c3d4e5f";
const buyer = { userId: USER, email: "medlem@example.com" };
const paths = { success: "/tilkoeb/kostplan/bekraeftelse", cancel: "/tilkoeb/kostplan" };

const baseProduct = {
  short_description: null,
  description: null,
  features: [],
  is_test: true,
  is_active: true,
} as unknown as CheckoutProduct;
const membership: CheckoutProduct = {
  ...baseProduct,
  id: "11111111-1111-4111-8111-111111111111",
  slug: "medlemskab",
  kind: "membership",
  name: "Medlemskab",
  price_amount: 29900,
  billing_interval: "month",
  stripe_price_id: "price_membership",
  mobilepay_enabled: false,
};
const kostplan: CheckoutProduct = {
  ...baseProduct,
  id: "22222222-2222-4222-8222-222222222222",
  slug: "kostplan",
  kind: "addon",
  name: "Kostplan",
  price_amount: 49900,
  billing_interval: "one_time",
  stripe_price_id: "price_kostplan",
  mobilepay_enabled: true,
};

type FakeSession = { id: string; mode: "payment" | "subscription"; status: "open" | "complete" | "expired"; url?: string };

function fakeStripe(sessions: FakeSession[] = [], subscriptionStatuses: string[] = []) {
  const byId = new Map(sessions.map((s) => [s.id, { ...s }]));
  const missing = (id: string) => Object.assign(new Error(`No such checkout.session: '${id}'`), { code: "resource_missing", statusCode: 404 });
  const api = {
    checkout: {
      sessions: {
        list: vi.fn(async (params: { status?: string }) => ({
          data: [...byId.values()].filter((s) => !params.status || s.status === params.status),
        })),
        retrieve: vi.fn(async (id: string) => {
          const session = byId.get(id);
          if (!session) throw missing(id);
          return { ...session };
        }),
        expire: vi.fn(async (id: string) => {
          const session = byId.get(id);
          if (!session) throw missing(id);
          if (session.status !== "open") throw Object.assign(new Error("Only open sessions can be expired."), { type: "StripeInvalidRequestError" });
          session.status = "expired";
          return { ...session };
        }),
        create: vi.fn(async (params: { mode: string }) => ({
          id: "cs_new",
          mode: params.mode,
          status: "open",
          livemode: false,
          url: "https://checkout.stripe.com/c/pay/cs_new",
        })),
      },
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: subscriptionStatuses.map((status, i) => ({ id: `sub_${i}`, status })) })),
    },
  };
  return { api, stripe: api as unknown as Stripe, byId };
}

let db: FakeSupabase;

function pendingPurchase(overrides: Row): Row {
  return { user_id: USER, product_id: kostplan.id, provider: "stripe", status: "pending", amount: 49900, ...overrides };
}

beforeEach(() => {
  db = createFakeSupabase({ purchases: [] });
  state.db = db;
});

describe("createMembershipCheckout", () => {
  it("creates a subscription checkout when the customer has no running subscription", async () => {
    const { api, stripe } = fakeStripe([], ["canceled", "incomplete_expired"]);
    const start = await createMembershipCheckout(stripe, buyer, membership);
    expect(start).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_new" });
    expect(api.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 100 });
    expect(api.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription", customer: "cus_1", metadata: { user_id: USER, product_id: membership.id } }),
    );
  });

  it("refuses while a subscription runs in Stripe, also one the webhook has not stored yet", async () => {
    for (const [statuses, text] of [
      [["active"], "Du har allerede et medlemskab"],
      [["trialing"], "Du har allerede et medlemskab"],
      [["past_due"], "Opdater dit betalingskort"],
      [["unpaid"], "Opdater dit betalingskort"],
      [["incomplete"], "Vi venter stadig på bekræftelse"],
    ] as const) {
      const { api, stripe } = fakeStripe([], [...statuses]);
      const start = await createMembershipCheckout(stripe, buyer, membership);
      expect(start).toEqual({ refused: expect.stringContaining(text) });
      expect(api.checkout.sessions.create).not.toHaveBeenCalled();
    }
  });

  it("closes earlier membership payment pages first, but leaves add-on pages alone", async () => {
    const { api, stripe, byId } = fakeStripe([
      { id: "cs_old", mode: "subscription", status: "open" },
      { id: "cs_addon", mode: "payment", status: "open" },
    ]);
    const start = await createMembershipCheckout(stripe, buyer, membership);
    expect(start).toEqual({ url: expect.any(String) });
    expect(api.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 100 });
    expect(api.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect(byId.get("cs_old")?.status).toBe("expired");
    expect(byId.get("cs_addon")?.status).toBe("open");
    // Pages are closed before the subscriptions are checked, so a page paid
    // in between shows up in that check.
    expect(api.checkout.sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(api.subscriptions.list.mock.invocationCallOrder[0]);
  });

  it("refuses when an earlier page was paid just before it could be closed", async () => {
    const { api, stripe } = fakeStripe([{ id: "cs_old", mode: "subscription", status: "open" }], ["active"]);
    // Paid between the listing and the expire call.
    api.checkout.sessions.expire.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Only open sessions can be expired."), { type: "StripeInvalidRequestError" });
    });
    api.checkout.sessions.retrieve.mockImplementationOnce(async () => ({ id: "cs_old", mode: "subscription", status: "complete" }));
    const start = await createMembershipCheckout(stripe, buyer, membership);
    expect(start).toEqual({ refused: expect.stringContaining("Du har allerede et medlemskab") });
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("does not create a second page when an earlier one could not be closed", async () => {
    const { api, stripe } = fakeStripe([{ id: "cs_old", mode: "subscription", status: "open" }]);
    const outage = Object.assign(new Error("Stripe is down"), { type: "StripeAPIError" });
    api.checkout.sessions.expire.mockRejectedValueOnce(outage);
    await expect(createMembershipCheckout(stripe, buyer, membership)).rejects.toBe(outage);
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("createAddonCheckout", () => {
  it("creates a pending purchase linked to the session, with its livemode", async () => {
    const { stripe } = fakeStripe();
    const start = await createAddonCheckout(stripe, buyer, kostplan, paths);
    expect(start).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_new" });
    expect(db.rows("purchases")).toHaveLength(1);
    expect(db.rows("purchases")[0]).toMatchObject({
      user_id: USER,
      product_id: kostplan.id,
      status: "pending",
      provider_checkout_session_id: "cs_new",
      livemode: false,
    });
  });

  it("closes an earlier open payment page for the plan and cancels its purchase", async () => {
    db.tables.purchases = [pendingPurchase({ id: "p_old", provider_checkout_session_id: "cs_old" })];
    const { api, stripe, byId } = fakeStripe([{ id: "cs_old", mode: "payment", status: "open" }]);

    const start = await createAddonCheckout(stripe, buyer, kostplan, paths);

    expect(start).toEqual({ url: expect.any(String) });
    expect(api.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
    expect(byId.get("cs_old")?.status).toBe("expired");
    expect(db.rows("purchases").find((row) => row.id === "p_old")?.status).toBe("canceled");
    expect(db.rows("purchases").filter((row) => row.status === "pending")).toHaveLength(1);
  });

  it("cancels the purchase of a page that has already expired", async () => {
    db.tables.purchases = [pendingPurchase({ id: "p_old", provider_checkout_session_id: "cs_old" })];
    const { api, stripe } = fakeStripe([{ id: "cs_old", mode: "payment", status: "expired" }]);
    await createAddonCheckout(stripe, buyer, kostplan, paths);
    expect(api.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(db.rows("purchases").find((row) => row.id === "p_old")?.status).toBe("canceled");
  });

  it("refuses while an earlier payment for the plan waits for confirmation", async () => {
    db.tables.purchases = [pendingPurchase({ id: "p_old", provider_checkout_session_id: "cs_old" })];
    const { api, stripe } = fakeStripe([{ id: "cs_old", mode: "payment", status: "complete" }]);

    const start = await createAddonCheckout(stripe, buyer, kostplan, paths);

    expect(start).toEqual({ refused: expect.stringContaining("Vi venter stadig på bekræftelse af din betaling for kostplanen") });
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
    expect(db.rows("purchases")).toHaveLength(1);
    expect(db.rows("purchases")[0].status).toBe("pending"); // the webhook will mark it as paid
  });

  it("skips a page from the other Stripe mode, and other users' and products' purchases", async () => {
    db.tables.purchases = [
      pendingPurchase({ id: "p_test", provider_checkout_session_id: "cs_test_mode" }),
      pendingPurchase({ id: "p_other_user", user_id: OTHER_USER, provider_checkout_session_id: "cs_other_user" }),
      pendingPurchase({ id: "p_other_product", product_id: membership.id, provider_checkout_session_id: "cs_other_product" }),
    ];
    const { api, stripe } = fakeStripe([
      { id: "cs_other_user", mode: "payment", status: "open" },
      { id: "cs_other_product", mode: "payment", status: "open" },
    ]);

    const start = await createAddonCheckout(stripe, buyer, kostplan, paths);

    expect(start).toEqual({ url: expect.any(String) });
    expect(api.checkout.sessions.retrieve).toHaveBeenCalledTimes(1);
    expect(api.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_mode");
    expect(api.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(db.rows("purchases").filter((row) => row.status === "pending")).toHaveLength(4);
  });
});
