import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createAdmin,
  createUser,
  daysFromNow,
  expectDenied,
  rowsAs,
  setSubscription,
  setupDatabase,
  sql,
  teardownDatabase,
  value,
  valueAs,
} from "./helpers";

// admin_overview_stats() and admin_member_list() against a small, fully known
// population (this file has its own database, so the counts are exact).

let admin: string;
const u: Record<string, string> = {};

async function person(key: string, name: string) {
  u[key] = await createUser(`${key}@test.dk`, name);
  return u[key];
}

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin("coach", "Træneren");

  await setSubscription(await person("active", "Anders Aktiv"), "active");
  await setSubscription(await person("canceling", "Bent Opsagt"), "active", { cancel_at_period_end: true, current_period_end: daysFromNow(9) });
  await setSubscription(await person("grace", "Carl Gregersen"), "past_due", { payment_failed_at: daysFromNow(-2) });
  await setSubscription(await person("pastdue", "Dan Restance"), "past_due", { payment_failed_at: daysFromNow(-8) });
  await setSubscription(await person("pending", "Erik Afventer"), "incomplete");
  await person("none", "Frank Ingen");
  await setSubscription(await person("expired", "Gert Udløbet"), "canceled");

  // Onboarding: submitted by active, grace and pastdue; reviewed for canceling.
  for (const key of ["active", "grace", "pastdue"]) {
    await sql("insert into public.onboarding_submissions (user_id, status) values ($1, 'submitted')", [u[key]]);
  }
  await sql("insert into public.onboarding_submissions (user_id, status, reviewed_by, reviewed_at) values ($1, 'reviewed', $2, now())", [u.canceling, admin]);

  // canceling has a published training plan; nobody else does.
  const plan = await value<string>("insert into public.training_plans (member_id, title) values ($1, 'Plan') returning id", [u.canceling]);
  await sql("insert into public.training_sessions (plan_id, title) values ($1, 'Dag 1')", [plan]);
  await asUser(admin, (c) => c.query("select public.publish_training_plan($1)", [plan]));

  // Nutrition add-on: active (no plan yet) and canceling (published plan).
  await asUser(admin, (c) => c.query("select public.grant_addon($1, 'kostplan')", [u.active]));
  await asUser(admin, (c) => c.query("select public.grant_addon($1, 'kostplan')", [u.canceling]));
  const np = await value<string>("insert into public.nutrition_plans (member_id, title) values ($1, 'Kost') returning id", [u.canceling]);
  await asUser(admin, (c) => c.query("select public.publish_nutrition_plan($1)", [np]));

  // Conversations: active wrote to the coach (unanswered); canceling wrote and the coach has read it.
  for (const key of ["active", "canceling"]) {
    const conv = await valueAs<string>(u[key], "select public.get_or_create_direct_conversation($1)", [admin]);
    await asUser(u[key], (c) => c.query("insert into public.private_messages (conversation_id, sender_id, body) values ($1, $2, 'Hej')", [conv, u[key]]));
    if (key === "canceling") await asUser(admin, (c) => c.query("select public.mark_conversation_read($1)", [conv]));
  }

  // Reports: one open, one resolved.
  await valueAs(u.active, "select public.report_content('profile', $1, 'Spam')", [u.canceling]);
  const resolved = await valueAs<string>(u.grace, "select public.report_content('profile', $1, 'Spam')", [u.canceling]);
  await asUser(admin, (c) => c.query("select public.resolve_report($1, 'dismissed')", [resolved]));

  // Data requests: one pending, one canceled.
  await asUser(u.expired, (c) => c.query("insert into public.data_requests (user_id, type) values ($1, 'deletion')", [u.expired]));
  await asUser(u.none, async (c) => {
    const { rows } = await c.query("insert into public.data_requests (user_id, type) values ($1, 'export') returning id", [u.none]);
    await c.query("update public.data_requests set status = 'canceled' where id = $1", [rows[0].id]);
  });

  await asUser(admin, (c) => c.query("select public.set_community_suspension($1, true)", [u.none]));
});
afterAll(teardownDatabase);

describe("admin_overview_stats", () => {
  it("is denied to members", async () => {
    await expectDenied(valueAs(u.active, "select public.admin_overview_stats()"), /Kun administratorer/);
  });

  it("returns the correct figures for the administrator", async () => {
    const stats = await valueAs<Record<string, number>>(admin, "select public.admin_overview_stats()");
    const unread = await value<number>("select count(*)::int from public.notifications where user_id = $1 and read_at is null", [admin]);
    expect(unread).toBeGreaterThan(0);
    expect(stats).toEqual({
      total_members: 7,
      active: 1,
      canceling: 1,
      past_due: 2,
      pending: 1,
      new_onboarding: 3,
      plans_awaiting: 2,
      unanswered_conversations: 1,
      open_reports: 1,
      pending_data_requests: 1,
      unread_notifications: unread,
      nutrition_without_plan: 1,
    });
  });
});

describe("admin_member_list", () => {
  it("is denied to members", async () => {
    await expectDenied(rowsAs(u.active, "select * from public.admin_member_list()"), /Kun administratorer/);
  });

  it("lists everyone with the right state and flags", async () => {
    const rows = await rowsAs(admin, "select * from public.admin_member_list()");
    expect(rows).toHaveLength(8);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    const states = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, byId.get(id)?.membership_state]));
    expect(states).toEqual({
      active: "active",
      canceling: "canceling",
      grace: "past_due_grace",
      pastdue: "past_due",
      pending: "pending",
      none: "none",
      expired: "expired",
    });
    expect(byId.get(admin)).toMatchObject({ membership_state: "admin", is_admin: true });
    expect(byId.get(u.canceling)).toMatchObject({ has_published_plan: true, has_nutrition: true, onboarding_status: "submitted" });
    expect(byId.get(u.active)).toMatchObject({ has_published_plan: false, has_nutrition: true, email: "active@test.dk", is_admin: false });
    expect(byId.get(u.none)).toMatchObject({ community_suspended: true, onboarding_status: "not_started" });
  });

  it("searches by name and e-mail", async () => {
    const byName = await rowsAs(admin, "select id from public.admin_member_list($1)", ["gregersen"]);
    expect(byName).toEqual([{ id: u.grace }]);
    const byEmail = await rowsAs(admin, "select id from public.admin_member_list($1)", ["pending@"]);
    expect(byEmail).toEqual([{ id: u.pending }]);
    expect(await rowsAs(admin, "select id from public.admin_member_list($1)", [""])).toHaveLength(8);
  });
});
