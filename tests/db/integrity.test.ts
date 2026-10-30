import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asService,
  asUser,
  createAdmin,
  createMember,
  createUser,
  expectDenied,
  expectRlsViolation,
  rowCountAs,
  rowsAs,
  setupDatabase,
  sql,
  teardownDatabase,
  uniqueEmail,
  value,
  valueAs,
} from "./helpers";

// Roles, billing and protected profile fields can only be changed by the
// server or an administrator – never by a member's own browser session.

let admin: string;
let member: string;
let other: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin();
  member = await createMember("member", "Jens Hansen");
  other = await createMember("other", "Ole Olsen");
  await sql("insert into public.billing_customers (user_id, stripe_customer_id) values ($1, 'cus_member'), ($2, 'cus_other')", [member, other]);
  await sql(
    `insert into public.purchases (user_id, product_id, provider, status, amount)
     values ($1, (select id from public.products where slug = 'kostplan'), 'stripe', 'paid', 4900)`,
    [other],
  );
  await sql(
    "insert into public.payment_events (provider, provider_event_id, event_type, user_id, payload) values ('stripe', 'evt_1', 'invoice.paid', $1, '{}')",
    [member],
  );
});
afterAll(teardownDatabase);

const kostplan = "(select id from public.products where slug = 'kostplan')";

// -----------------------------------------------------------------------------
describe("roles", () => {
  it("a member cannot grant himself the admin role", async () => {
    await expectRlsViolation(asUser(member, (c) => c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [member])));
    expect(await valueAs(member, "select public.is_admin()")).toBe(false);
  });

  it("a member cannot remove the administrator's role", async () => {
    expect(await rowCountAs(member, "delete from public.user_roles where user_id = $1", [admin])).toBe(0);
    expect(await value("select public._is_admin_user($1)", [admin])).toBe(true);
  });

  it("a member sees only his own roles", async () => {
    expect(await rowsAs(member, "select * from public.user_roles")).toEqual([]);
    expect(await rowsAs(admin, "select role from public.user_roles where user_id = $1", [admin])).toEqual([{ role: "admin" }]);
  });

  it("the admin role marks the profile as the coach", async () => {
    expect(await value("select is_coach from public.profiles where id = $1", [admin])).toBe(true);
    expect(await value("select coach_user_id from public.site_settings where id = 1")).toBe(admin);
  });
});

// -----------------------------------------------------------------------------
describe("billing tables are written by the server only", () => {
  it("a member cannot insert subscriptions, purchases, payment events or billing customers", async () => {
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query("insert into public.subscriptions (user_id, provider_subscription_id, status) values ($1, 'sub_fake', 'active')", [member]),
      ),
    );
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query(`insert into public.purchases (user_id, product_id, provider, status) values ($1, ${kostplan}, 'stripe', 'paid')`, [member]),
      ),
    );
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query("insert into public.payment_events (provider, provider_event_id, event_type, payload) values ('stripe', 'evt_fake', 'x', '{}')"),
      ),
    );
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.billing_customers (user_id, stripe_customer_id) values ($1, 'cus_fake')", [member])),
    );
  });

  it("a member cannot update or delete his own billing rows", async () => {
    expect(await rowCountAs(member, "update public.subscriptions set current_period_end = now() + interval '10 years' where user_id = $1", [member])).toBe(0);
    expect(await rowCountAs(member, "update public.subscriptions set status = 'active', cancel_at_period_end = false")).toBe(0);
    expect(await rowCountAs(member, "delete from public.subscriptions where user_id = $1", [member])).toBe(0);
    expect(await rowCountAs(member, "update public.billing_customers set stripe_customer_id = 'cus_other' where user_id = $1", [member])).toBe(0);
    expect(await rowCountAs(member, "update public.payment_events set status = 'processed'")).toBe(0);
  });

  it("a member reads his own subscription and purchases, not other people's", async () => {
    expect(await rowsAs(member, "select user_id from public.subscriptions")).toEqual([{ user_id: member }]);
    expect(await rowsAs(member, "select user_id from public.purchases")).toEqual([]);
    expect(await rowsAs(member, "select user_id from public.billing_customers")).toEqual([{ user_id: member }]);
    expect(await rowsAs(member, "select id from public.payment_events")).toEqual([]);
    expect(await rowsAs(admin, "select provider_event_id from public.payment_events")).toEqual([{ provider_event_id: "evt_1" }]);
  });

  it("the same provider event can only be stored once (webhook idempotency)", async () => {
    const error = await asService((c) =>
      c.query("insert into public.payment_events (provider, provider_event_id, event_type, payload) values ('stripe', 'evt_1', 'invoice.paid', '{}')"),
    ).catch((e: { code?: string }) => e);
    expect((error as { code?: string }).code).toBe("23505");
  });

  it("a member cannot read or change admin settings, products or site settings", async () => {
    expect(await rowsAs(member, "select * from public.admin_settings")).toEqual([]);
    expect(await rowCountAs(member, "update public.admin_settings set grace_period_days = 60")).toBe(0);
    expect(await rowCountAs(member, "update public.products set price_amount = 1")).toBe(0);
    expect(await rowCountAs(member, "update public.site_settings set coach_name = 'Hacker'")).toBe(0);
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.products (slug, kind, name, billing_interval) values ('gratis', 'addon', 'Gratis', 'one_time')")),
    );
    expect(await value("select grace_period_days from public.admin_settings")).toBe(7);
  });
});

// -----------------------------------------------------------------------------
describe("protected profile fields", () => {
  it("a member can change his own name and bio", async () => {
    await asUser(member, (c) => c.query("update public.profiles set full_name = 'Jens H.', bio = 'Glad cyklist' where id = $1", [member]));
    expect(await value("select full_name from public.profiles where id = $1", [member])).toBe("Jens H.");
  });

  for (const [column, newValue] of [
    ["is_coach", "true"],
    ["community_suspended", "true"],
    ["onboarding_status", "'submitted'"],
    ["welcomed_at", "now()"],
  ] as const) {
    it(`a member cannot change profiles.${column}`, async () => {
      await expectDenied(asUser(member, (c) => c.query(`update public.profiles set ${column} = ${newValue} where id = $1`, [member])), /tilladelse/);
    });
  }

  it("a member cannot change someone else's profile", async () => {
    expect(await rowCountAs(member, "update public.profiles set full_name = 'Hacket' where id = $1", [other])).toBe(0);
  });

  it("a member can change his phone and preferences, but not his e-mail or suspension reason", async () => {
    await asUser(member, (c) => c.query("update public.profile_private set phone = '12345678', email_notifications = false where user_id = $1", [member]));
    expect(await value("select phone from public.profile_private where user_id = $1", [member])).toBe("12345678");
    await expectDenied(asUser(member, (c) => c.query("update public.profile_private set email = 'ny@test.dk' where user_id = $1", [member])));
    await expectDenied(
      asUser(member, (c) => c.query("update public.profile_private set suspension_reason = 'Selvvalgt' where user_id = $1", [member])),
    );
    // A suspended member cannot erase the reason either.
    await sql("update public.profile_private set suspension_reason = 'Spam' where user_id = $1", [other]);
    await expectDenied(asUser(other, (c) => c.query("update public.profile_private set suspension_reason = null where user_id = $1", [other])));
    await sql("update public.profile_private set suspension_reason = null where user_id = $1", [other]);
  });

  it("contact details are private: members cannot read other members' profile_private", async () => {
    expect(await rowsAs(member, "select user_id from public.profile_private")).toEqual([{ user_id: member }]);
    expect(await rowsAs(admin, "select user_id from public.profile_private where user_id = $1", [other])).toHaveLength(1);
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.profile_private (user_id, email) values ($1, 'x@test.dk')", [admin])),
    );
  });

  it("changing the login e-mail (auth.users) updates profile_private.email", async () => {
    const email = uniqueEmail("ny-adresse");
    await sql("update auth.users set email = $2 where id = $1", [other, email]);
    expect(await value("select email from public.profile_private where user_id = $1", [other])).toBe(email);
  });

  it("an administrator may change protected fields (e.g. lift a suspension)", async () => {
    await asUser(admin, (c) => c.query("update public.profiles set community_suspended = true where id = $1", [other]));
    await asUser(admin, (c) => c.query("update public.profiles set community_suspended = false where id = $1", [other]));
    expect(await value("select community_suspended from public.profiles where id = $1", [other])).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe("internal functions", () => {
  const internalCalls = [
    ["_notify_admins('system', 'Falsk', null, null)", []],
    ["_notify_user($1, 'system', 'Falsk', null, null)", ["other"]],
    ["_post_community_welcome($1)", ["member"]],
    ["bootstrap_admin('x@test.dk')", []],
    ["check_rate_limit('x', 100, 60)", []],
    ["_membership_state($1)", ["other"]],
    ["_is_entitled_user($1)", ["other"]],
    ["_has_addon($1, 'kostplan')", ["other"]],
  ] as const;
  const params = (names: readonly string[]) => names.map((n) => (n === "other" ? other : member));

  for (const [call, names] of internalCalls) {
    it(`a member cannot execute ${call.split("(")[0]}`, async () => {
      await expectDenied(asUser(member, (c) => c.query(`select public.${call}`, params(names))), /permission denied for function/);
    });
  }

  it("a member cannot make himself admin through bootstrap_admin", async () => {
    const email = await value<string>("select email from auth.users where id = $1", [member]);
    await expectDenied(asUser(member, (c) => c.query("select public.bootstrap_admin($1)", [email])));
    expect(await value("select public._is_admin_user($1)", [member])).toBe(false);
  });

  it("the server (service_role) can execute the internal functions", async () => {
    await asService(async (c) => {
      await c.query("select public._notify_user($1, 'payment', 'Betaling modtaget', null, '/min-profil')", [member]);
      await c.query("select public._notify_admins('new_member', 'Nyt medlem', null, '/admin/medlemmer')");
      const { rows } = await c.query(
        "select public._membership_state($1) as state, public._is_entitled_user($1) as entitled, public._has_addon($2, 'kostplan') as addon, public.check_rate_limit('test:svc', 1, 60) as first, public.check_rate_limit('test:svc', 1, 60) as second",
        [member, other],
      );
      expect(rows[0]).toEqual({ state: "active", entitled: true, addon: true, first: true, second: false });
    });
    expect(await rowsAs(member, "select title from public.notifications where type = 'payment'")).toEqual([{ title: "Betaling modtaget" }]);
    expect(await rowsAs(admin, "select title from public.notifications where type = 'new_member'")).toEqual([{ title: "Nyt medlem" }]);
  });

  it("the server can bootstrap a new administrator", async () => {
    const email = uniqueEmail("ny-admin");
    const id = await createUser(email, "Ny Admin");
    await asService((c) => c.query("select public.bootstrap_admin($1)", [email]));
    expect(await value("select public._is_admin_user($1)", [id])).toBe(true);
    // The first admin stays the coach account.
    expect(await value("select coach_user_id from public.site_settings where id = 1")).toBe(admin);
  });
});

// -----------------------------------------------------------------------------
describe("data requests", () => {
  let requester: string;

  beforeAll(async () => {
    requester = await createMember("data", "Data Dorthe");
  });

  const insertRequest = (userId: string, fields = "") =>
    asUser(userId, async (c) => {
      const { rows } = await c.query(
        `insert into public.data_requests (user_id, type${fields ? ", status, handled_by, completed_at" : ""})
         values ($1, 'deletion'${fields ? `, ${fields}` : ""}) returning id`,
        [userId],
      );
      return rows[0].id as string;
    });

  it("a member's request is always created as pending, with his e-mail, and the admin is notified", async () => {
    const before = await value<number>("select count(*)::int from public.notifications where user_id = $1 and type = 'data_request'", [admin]);
    const id = await insertRequest(requester, `'completed', '${admin}', now()`);
    const [row] = await sql("select status, handled_by, completed_at, user_email from public.data_requests where id = $1", [id]);
    expect(row.status).toBe("pending");
    expect(row.handled_by).toBeNull();
    expect(row.completed_at).toBeNull();
    expect(row.user_email).toBe(await value("select email from auth.users where id = $1", [requester]));
    expect(await value<number>("select count(*)::int from public.notifications where user_id = $1 and type = 'data_request'", [admin])).toBe(before + 1);
  });

  it("a member cannot create a request for someone else", async () => {
    await expectRlsViolation(
      asUser(requester, (c) => c.query("insert into public.data_requests (user_id, type) values ($1, 'export')", [other])),
    );
  });

  it("a member cannot mark his request completed, but can cancel it once", async () => {
    // Only one pending request per type: close the one from the first test.
    await sql("update public.data_requests set status = 'canceled' where user_id = $1 and status = 'pending'", [requester]);
    const id = await insertRequest(requester);
    await expectDenied(asUser(requester, (c) => c.query("update public.data_requests set status = 'completed' where id = $1", [id])), /annullere/);
    await asUser(requester, (c) => c.query("update public.data_requests set status = 'canceled' where id = $1", [id]));
    expect(await value("select status from public.data_requests where id = $1", [id])).toBe("canceled");
    await expectDenied(asUser(requester, (c) => c.query("update public.data_requests set status = 'pending' where id = $1", [id])));
  });

  it("members see only their own requests", async () => {
    await insertRequest(other);
    const rows = await rowsAs(requester, "select user_id from public.data_requests");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.user_id === requester)).toBe(true);
    expect(await rowCountAs(requester, "update public.data_requests set status = 'canceled' where user_id = $1", [other])).toBe(0);
  });

  it("an administrator can complete a request", async () => {
    const id = await insertRequest(requester);
    await asUser(admin, (c) =>
      c.query("update public.data_requests set status = 'completed', handled_by = $2, completed_at = now() where id = $1", [id, admin]),
    );
    const [row] = await sql("select status, handled_by from public.data_requests where id = $1", [id]);
    expect(row).toEqual({ status: "completed", handled_by: admin });
  });
});
