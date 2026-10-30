import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asService,
  createAdmin,
  createUser,
  daysFromNow,
  expectDenied,
  setSubscription,
  setupDatabase,
  sql,
  teardownDatabase,
  uniqueEmail,
  value,
  valueAs,
} from "./helpers";

// public._membership_state(user) is the single source of truth for paid access.
// These tests drive it through every provider status the webhook can store.

beforeAll(setupDatabase);
afterAll(teardownDatabase);

const state = (userId: string) => value<string>("select public._membership_state($1)", [userId]);
const entitled = (userId: string) => value<boolean>("select public._is_entitled_user($1)", [userId]);
const newUser = (name = "Medlem") => createUser(uniqueEmail("ms"), name);

describe("_membership_state", () => {
  it("is none without any subscription", async () => {
    const id = await newUser();
    expect(await state(id)).toBe("none");
    expect(await entitled(id)).toBe(false);
  });

  it("is none for a null user", async () => {
    expect(await value("select public._membership_state(null)")).toBe("none");
  });

  it("incomplete (checkout not paid yet) → pending, not entitled", async () => {
    const id = await newUser();
    await setSubscription(id, "incomplete");
    expect(await state(id)).toBe("pending");
    expect(await entitled(id)).toBe(false);
  });

  it("active → active, entitled", async () => {
    const id = await newUser();
    await setSubscription(id, "active");
    expect(await state(id)).toBe("active");
    expect(await entitled(id)).toBe(true);
  });

  it("trialing counts as active", async () => {
    const id = await newUser();
    await setSubscription(id, "trialing");
    expect(await state(id)).toBe("active");
  });

  it("active + cancel_at_period_end with a future period end → canceling (still entitled)", async () => {
    const id = await newUser();
    await setSubscription(id, "active", { cancel_at_period_end: true, current_period_end: daysFromNow(10) });
    expect(await state(id)).toBe("canceling");
    expect(await entitled(id)).toBe(true);
  });

  it("active + cancel_at in the future → canceling", async () => {
    const id = await newUser();
    await setSubscription(id, "active", { cancel_at: daysFromNow(3), current_period_end: daysFromNow(10) });
    expect(await state(id)).toBe("canceling");
  });

  it("canceling with a period end in the past → expired", async () => {
    const id = await newUser();
    await setSubscription(id, "active", { cancel_at_period_end: true, current_period_end: daysFromNow(-1) });
    expect(await state(id)).toBe("expired");
    expect(await entitled(id)).toBe(false);
  });

  it("past_due with the first failed payment 3 days ago (grace 7) → past_due_grace, entitled", async () => {
    const id = await newUser();
    await setSubscription(id, "past_due", { payment_failed_at: daysFromNow(-3) });
    expect(await state(id)).toBe("past_due_grace");
    expect(await entitled(id)).toBe(true);
  });

  it("past_due with the first failed payment 8 days ago → past_due, not entitled", async () => {
    const id = await newUser();
    await setSubscription(id, "past_due", { payment_failed_at: daysFromNow(-8) });
    expect(await state(id)).toBe("past_due");
    expect(await entitled(id)).toBe(false);
  });

  it("raising admin_settings.grace_period_days to 10 brings the 8-day case back into grace", async () => {
    const id = await newUser();
    await setSubscription(id, "past_due", { payment_failed_at: daysFromNow(-8) });
    await sql("begin");
    try {
      await sql("update public.admin_settings set grace_period_days = 10 where id = 1");
      expect(await state(id)).toBe("past_due_grace");
      expect(await entitled(id)).toBe(true);
    } finally {
      await sql("rollback");
    }
    expect(await state(id)).toBe("past_due");
  });

  it("past_due without payment_failed_at falls back to the period end", async () => {
    const id = await newUser();
    await setSubscription(id, "past_due", { current_period_end: daysFromNow(-2) });
    expect(await state(id)).toBe("past_due_grace");
  });

  it("canceled → expired", async () => {
    const id = await newUser();
    await setSubscription(id, "canceled", { current_period_end: daysFromNow(-5), ended_at: daysFromNow(-5) });
    expect(await state(id)).toBe("expired");
  });

  it("paused → expired", async () => {
    const id = await newUser();
    await setSubscription(id, "paused");
    expect(await state(id)).toBe("expired");
  });

  it("incomplete_expired (checkout abandoned) → none", async () => {
    const id = await newUser();
    await setSubscription(id, "incomplete_expired");
    expect(await state(id)).toBe("none");
  });

  it("unpaid → past_due, not entitled", async () => {
    const id = await newUser();
    await setSubscription(id, "unpaid", { payment_failed_at: daysFromNow(-1) });
    expect(await state(id)).toBe("past_due");
    expect(await entitled(id)).toBe(false);
  });

  it("an administrator is admin (and entitled) without a subscription", async () => {
    const id = await createAdmin();
    expect(await state(id)).toBe("admin");
    expect(await entitled(id)).toBe(true);
  });

  it("ignores subscriptions that belong to an add-on product", async () => {
    const id = await newUser();
    await setSubscription(id, "active", { product: "kostplan" });
    expect(await state(id)).toBe("none");
  });

  describe("with several subscriptions it picks the best one", () => {
    it("old canceled + new active → active", async () => {
      const id = await newUser();
      await setSubscription(id, "canceled", { ref: "old", created_at: daysFromNow(-200), current_period_end: daysFromNow(-100) });
      await setSubscription(id, "active", { ref: "new" });
      expect(await state(id)).toBe("active");
    });

    it("new canceled + older active → active (status wins over age)", async () => {
      const id = await newUser();
      await setSubscription(id, "active", { ref: "old", created_at: daysFromNow(-60) });
      await setSubscription(id, "canceled", { ref: "new" });
      expect(await state(id)).toBe("active");
    });

    it("past_due in grace beats a newer incomplete checkout", async () => {
      const id = await newUser();
      await setSubscription(id, "past_due", { ref: "a", created_at: daysFromNow(-30), payment_failed_at: daysFromNow(-2) });
      await setSubscription(id, "incomplete", { ref: "b" });
      expect(await state(id)).toBe("past_due_grace");
    });

    it("incomplete beats canceled", async () => {
      const id = await newUser();
      await setSubscription(id, "canceled", { ref: "a" });
      await setSubscription(id, "incomplete", { ref: "b", created_at: daysFromNow(-1) });
      expect(await state(id)).toBe("pending");
    });
  });
});

describe("membership_state / membership_summary / is_entitled as API callers", () => {
  it("a member reads his own state and summary", async () => {
    const id = await newUser("Jens Hansen");
    await setSubscription(id, "active", { cancel_at_period_end: true, current_period_end: daysFromNow(12), amount: 9900 });
    expect(await valueAs(id, "select public.membership_state()")).toBe("canceling");
    expect(await valueAs(id, "select public.is_entitled()")).toBe(true);
    const summary = await valueAs<Record<string, unknown>>(id, "select public.membership_summary()");
    expect(summary).toMatchObject({ state: "canceling", status: "active", cancel_at_period_end: true, amount: 9900 });
    expect(summary.product_name).toBe("Stærk50 medlemskab");
    expect(summary.access_until).toBeTruthy();
    expect(summary.grace_until).toBeNull();
  });

  it("summary reports grace_until for past_due", async () => {
    const id = await newUser();
    await setSubscription(id, "past_due", { payment_failed_at: daysFromNow(-2) });
    const summary = await valueAs<Record<string, unknown>>(id, "select public.membership_summary()");
    expect(summary.state).toBe("past_due_grace");
    const graceUntil = new Date(summary.grace_until as string).getTime();
    expect(Math.abs(graceUntil - daysFromNow(5).getTime())).toBeLessThan(60_000);
  });

  it("a member cannot read another member's state or summary", async () => {
    const me = await newUser();
    const other = await newUser();
    await setSubscription(other, "active");
    await expectDenied(valueAs(me, "select public.membership_state($1)", [other]));
    await expectDenied(valueAs(me, "select public.membership_summary($1)", [other]));
  });

  it("an administrator can read any member's state and summary", async () => {
    const admin = await createAdmin();
    const other = await newUser();
    await setSubscription(other, "past_due", { payment_failed_at: daysFromNow(-9) });
    expect(await valueAs(admin, "select public.membership_state($1)", [other])).toBe("past_due");
    const summary = await valueAs<Record<string, unknown>>(admin, "select public.membership_summary($1)", [other]);
    expect(summary.state).toBe("past_due");
  });

  it("a visitor cannot look up a member's state by id (regression: '<>' with a null auth.uid())", async () => {
    const other = await newUser();
    await setSubscription(other, "active");
    await expectDenied(asAnon((c) => c.query("select public.membership_state($1)", [other])));
    await expectDenied(asAnon((c) => c.query("select public.membership_summary($1)", [other])));
  });

  it("without a logged-in user the RPC itself refuses another user's id (defence in depth)", async () => {
    const other = await newUser();
    await setSubscription(other, "active");
    // The server role may execute it, but has no auth.uid(): the check must not be skipped.
    await expectDenied(asService((c) => c.query("select public.membership_state($1)", [other])), /Ikke tilladt/);
    await expectDenied(asService((c) => c.query("select public.membership_summary($1)", [other])), /Ikke tilladt/);
    // The server uses the internal function instead.
    const viaInternal = await asService(async (c) => (await c.query("select public._membership_state($1) as s", [other])).rows[0].s);
    expect(viaInternal).toBe("active");
  });
});
