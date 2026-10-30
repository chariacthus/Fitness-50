import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createAdmin,
  createMember,
  createUser,
  expectDenied,
  expectError,
  expectRlsViolation,
  rowCountAs,
  rowsAs,
  setSubscription,
  setupDatabase,
  sql,
  teardownDatabase,
  uniqueEmail,
  value,
  valueAs,
} from "./helpers";

// Onboarding questionnaire, training plans and nutrition plans: what members
// may read and write, and what only Christian (admin) may do.

let admin: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin();
});
afterAll(teardownDatabase);

const HEALTH = "Opereret i venstre knæ i 2019, ondt i lænden ved tunge løft";

async function adminNotifications(type: string) {
  return sql<{ title: string; body: string | null; link: string | null; data: unknown }>(
    "select title, body, link, data from public.notifications where user_id = $1 and type = $2 order by created_at",
    [admin, type],
  );
}

// -----------------------------------------------------------------------------
describe("onboarding", () => {
  it("an entitled member inserts and updates his own questionnaire", async () => {
    const m = await createMember("onb", "Jens Hansen");
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, answers, current_step) values ($1, $2, 1)", [
        m,
        { full_name: "Jens Hansen" },
      ]),
    );
    expect(await value("select onboarding_status from public.profiles where id = $1", [m])).toBe("in_progress");
    const updated = await rowCountAs(m, "update public.onboarding_submissions set current_step = 3 where user_id = $1", [m]);
    expect(updated).toBe(1);
    const [row] = await rowsAs(m, "select status, current_step from public.onboarding_submissions where user_id = $1", [m]);
    expect(row).toEqual({ status: "draft", current_step: 3 });
  });

  it("a member without an active membership cannot insert", async () => {
    const m = await createUser(uniqueEmail("onb-none"), "Uden Medlemskab");
    await expectRlsViolation(asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id) values ($1)", [m])));
    const lapsed = await createUser(uniqueEmail("onb-lapsed"), "Udløbet");
    await setSubscription(lapsed, "canceled");
    await expectRlsViolation(asUser(lapsed, (c) => c.query("insert into public.onboarding_submissions (user_id) values ($1)", [lapsed])));
  });

  it("a member cannot insert a questionnaire for someone else", async () => {
    const m = await createMember("onb-a");
    const other = await createMember("onb-b");
    await expectRlsViolation(asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id) values ($1)", [other])));
  });

  it("a member cannot read another member's questionnaire, the admin can", async () => {
    const m = await createMember("onb-c");
    const other = await createMember("onb-d");
    await asUser(other, (c) => c.query("insert into public.onboarding_submissions (user_id) values ($1)", [other]));
    expect(await rowsAs(m, "select * from public.onboarding_submissions where user_id = $1", [other])).toEqual([]);
    expect(await rowCountAs(m, "update public.onboarding_submissions set current_step = 5 where user_id = $1", [other])).toBe(0);
    expect(await rowsAs(admin, "select id from public.onboarding_submissions where user_id = $1", [other])).toHaveLength(1);
  });

  it("a member cannot mark his questionnaire as reviewed or set reviewed_by", async () => {
    const m = await createMember("onb-e");
    await expectDenied(
      asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id, status) values ($1, 'reviewed')", [m])),
      /gennemgået/,
    );
    // reviewed_by/reviewed_at sent on insert are dropped.
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, reviewed_by, reviewed_at) values ($1, $2, now())", [m, admin]),
    );
    const [row] = await sql("select reviewed_by, reviewed_at from public.onboarding_submissions where user_id = $1", [m]);
    expect(row).toEqual({ reviewed_by: null, reviewed_at: null });
    await expectDenied(asUser(m, (c) => c.query("update public.onboarding_submissions set status = 'reviewed' where user_id = $1", [m])));
    await expectDenied(asUser(m, (c) => c.query("update public.onboarding_submissions set reviewed_by = $2 where user_id = $1", [m, admin])));
    await expectDenied(asUser(m, (c) => c.query("update public.onboarding_submissions set reviewed_at = now() where user_id = $1", [m])));
  });

  it("the admin can mark it reviewed; a later edit by the member sends it back as submitted", async () => {
    const m = await createMember("onb-f");
    await asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id, status) values ($1, 'submitted')", [m]));
    await asUser(admin, (c) =>
      c.query("update public.onboarding_submissions set status = 'reviewed', reviewed_by = $2, reviewed_at = now() where user_id = $1", [m, admin]),
    );
    await asUser(m, (c) => c.query("update public.onboarding_submissions set answers = '{\"goals\":[\"styrke\"]}' where user_id = $1", [m]));
    const [row] = await sql("select status, reviewed_by from public.onboarding_submissions where user_id = $1", [m]);
    expect(row.status).toBe("submitted");
    expect(row.reviewed_by).toBe(admin);
  });

  it("health info is never stored without consent", async () => {
    // Design note: the guard trigger clears health_info when consent is missing
    // (instead of rejecting the row), so the sensitive text is never persisted.
    // The form itself rejects it earlier (healthSchema refine).
    const m = await createMember("onb-g");
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, health_info, health_consent) values ($1, $2, false)", [m, HEALTH]),
    );
    expect(await value("select health_info from public.onboarding_submissions where user_id = $1", [m])).toBeNull();
    await asUser(m, (c) => c.query("update public.onboarding_submissions set health_info = $2 where user_id = $1", [m, HEALTH]));
    expect(await value("select health_info from public.onboarding_submissions where user_id = $1", [m])).toBeNull();
    // Even the database owner cannot bypass the constraint + trigger.
    await sql("update public.onboarding_submissions set health_info = $2 where user_id = $1", [m, HEALTH]);
    expect(await value("select health_info from public.onboarding_submissions where user_id = $1", [m])).toBeNull();
  });

  it("with consent health info is stored with a timestamp; withdrawing consent deletes it", async () => {
    const m = await createMember("onb-h");
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, health_info, health_consent) values ($1, $2, true)", [m, HEALTH]),
    );
    const [stored] = await sql("select health_info, health_consent_at from public.onboarding_submissions where user_id = $1", [m]);
    expect(stored.health_info).toBe(HEALTH);
    expect(stored.health_consent_at).toBeTruthy();
    await asUser(m, (c) => c.query("update public.onboarding_submissions set health_consent = false where user_id = $1", [m]));
    const [cleared] = await sql("select health_info, health_consent_at from public.onboarding_submissions where user_id = $1", [m]);
    expect(cleared).toEqual({ health_info: null, health_consent_at: null });
  });

  it("submitting notifies the admin without any health information", async () => {
    const m = await createMember("onb-i", "Poul Sørensen");
    const before = (await adminNotifications("onboarding")).length;
    await asUser(m, (c) =>
      c.query(
        "insert into public.onboarding_submissions (user_id, status, health_info, health_consent, answers) values ($1, 'draft', $2, true, '{}')",
        [m, HEALTH],
      ),
    );
    expect((await adminNotifications("onboarding")).length).toBe(before);
    await asUser(m, (c) => c.query("update public.onboarding_submissions set status = 'submitted' where user_id = $1", [m]));
    const notes = await adminNotifications("onboarding");
    expect(notes.length).toBe(before + 1);
    const latest = notes[notes.length - 1];
    expect(latest.title).toBe("Nyt onboardingskema");
    expect(latest.body).toContain("Poul Sørensen");
    const everything = JSON.stringify(latest);
    expect(everything).not.toMatch(/knæ|lænden|Opereret/);
    expect(await value("select onboarding_status from public.profiles where id = $1", [m])).toBe("submitted");
    expect(await value("select submitted_at is not null from public.onboarding_submissions where user_id = $1", [m])).toBe(true);
  });

  it("the member cannot change his onboarding_status directly", async () => {
    const m = await createMember("onb-j");
    await expectDenied(asUser(m, (c) => c.query("update public.profiles set onboarding_status = 'submitted' where id = $1", [m])));
  });
});

// -----------------------------------------------------------------------------
describe("training plans", () => {
  async function createPlan(memberId: string, title: string, withSession = true) {
    const planId = await value<string>(
      "insert into public.training_plans (member_id, title, created_by) values ($1, $2, $3) returning id",
      [memberId, title, admin],
    );
    let sessionId: string | null = null;
    let exerciseId: string | null = null;
    if (withSession) {
      sessionId = await value<string>("insert into public.training_sessions (plan_id, title) values ($1, 'Dag 1') returning id", [planId]);
      exerciseId = await value<string>(
        "insert into public.exercises (session_id, name, sets, reps) values ($1, 'Squat', 3, '10') returning id",
        [sessionId],
      );
    }
    return { planId, sessionId: sessionId as string, exerciseId: exerciseId as string };
  }
  const publish = (planId: string) => asUser(admin, (c) => c.query("select public.publish_training_plan($1)", [planId]));
  const visiblePlans = (memberId: string) =>
    rowsAs<{ id: string; status: string }>(memberId, "select id, status from public.training_plans order by created_at");

  let member: string;
  let other: string;
  let first: Awaited<ReturnType<typeof createPlan>>;
  let second: Awaited<ReturnType<typeof createPlan>>;
  let othersPlan: Awaited<ReturnType<typeof createPlan>>;

  beforeAll(async () => {
    member = await createMember("plan", "Jens Hansen");
    other = await createMember("plan-other", "Ole Olsen");
    first = await createPlan(member, "Første plan");
    second = await createPlan(member, "Anden plan");
    othersPlan = await createPlan(other, "Oles plan");
  });

  it("a member cannot see his own draft (nor its sessions and exercises)", async () => {
    expect(await visiblePlans(member)).toEqual([]);
    expect(await rowsAs(member, "select id from public.training_sessions where plan_id = $1", [first.planId])).toEqual([]);
    expect(await rowsAs(member, "select id from public.exercises where session_id = $1", [first.sessionId])).toEqual([]);
  });

  it("a member cannot publish a plan", async () => {
    await expectDenied(asUser(member, (c) => c.query("select public.publish_training_plan($1)", [first.planId])), /Kun administratorer/);
    await expectDenied(asUser(member, (c) => c.query("select public.archive_training_plan($1)", [first.planId])));
    await expectDenied(asUser(member, (c) => c.query("select public.duplicate_training_plan($1)", [first.planId])));
  });

  it("a plan without training days cannot be published", async () => {
    const empty = await createPlan(member, "Tom plan", false);
    await expectError(publish(empty.planId), /mindst én træningsdag/);
    await sql("delete from public.training_plans where id = $1", [empty.planId]);
  });

  it("publishing makes the plan, sessions and exercises visible and notifies the member", async () => {
    await publish(first.planId);
    expect(await visiblePlans(member)).toEqual([{ id: first.planId, status: "published" }]);
    expect(await rowsAs(member, "select id from public.training_sessions where plan_id = $1", [first.planId])).toHaveLength(1);
    expect(await rowsAs(member, "select name from public.exercises where session_id = $1", [first.sessionId])).toEqual([{ name: "Squat" }]);
    const notes = await rowsAs(member, "select title, link from public.notifications where type = 'training_plan'");
    expect(notes).toEqual([{ title: "Din træningsplan er klar", link: "/min-traening" }]);
  });

  it("publishing a new plan archives the previous one and says 'opdateret'", async () => {
    await publish(second.planId);
    const [a, b] = await sql<{ status: string; archived_at: Date | null }>(
      "select status, archived_at from public.training_plans where id = any($1) order by created_at",
      [[first.planId, second.planId]],
    );
    expect(a.status).toBe("archived");
    expect(a.archived_at).toBeTruthy();
    expect(b.status).toBe("published");
    const titles = (await rowsAs(member, "select title from public.notifications where type = 'training_plan' order by created_at")).map(
      (r) => r.title,
    );
    expect(titles).toEqual(["Din træningsplan er klar", "Din træningsplan er opdateret"]);
    // Archived plans stay readable for the member's archive page.
    expect((await visiblePlans(member)).map((p) => p.status)).toEqual(["archived", "published"]);
    // Only drafts can be (re)published.
    await expectError(publish(first.planId), /Kun kladder/);
  });

  it("the database allows only one published plan per member", async () => {
    const error = await expectError(
      asUser(admin, (c) => c.query("update public.training_plans set status = 'published' where id = $1", [first.planId])),
    );
    expect(error.code).toBe("23505");
  });

  it("a member cannot see another member's plan, sessions or exercises", async () => {
    await publish(othersPlan.planId);
    expect(await rowsAs(member, "select id from public.training_plans where id = $1", [othersPlan.planId])).toEqual([]);
    expect(await rowsAs(member, "select id from public.training_sessions where id = $1", [othersPlan.sessionId])).toEqual([]);
    expect(await rowsAs(member, "select id from public.exercises where id = $1", [othersPlan.exerciseId])).toEqual([]);
  });

  it("a member cannot insert, update or delete plans, sessions or exercises", async () => {
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.training_plans (member_id, title, status) values ($1, 'Egen plan', 'published')", [member])),
    );
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.training_sessions (plan_id, title) values ($1, 'Ekstra')", [second.planId])),
    );
    await expectRlsViolation(
      asUser(member, (c) => c.query("insert into public.exercises (session_id, name) values ($1, 'Ekstra')", [second.sessionId])),
    );
    expect(await rowCountAs(member, "update public.training_plans set title = 'Ændret' where id = $1", [second.planId])).toBe(0);
    expect(await rowCountAs(member, "update public.exercises set sets = 1 where id = $1", [second.exerciseId])).toBe(0);
    expect(await rowCountAs(member, "delete from public.training_sessions where id = $1", [second.sessionId])).toBe(0);
    expect(await rowCountAs(member, "delete from public.training_plans where id = $1", [second.planId])).toBe(0);
    expect(await value("select title from public.training_plans where id = $1", [second.planId])).toBe("Anden plan");
  });

  it("workout completions: only for sessions in the member's own published plan", async () => {
    const insert = (memberId: string, sessionId: string) =>
      asUser(memberId, (c) => c.query("insert into public.workout_completions (member_id, session_id) values ($1, $2)", [memberId, sessionId]));
    await insert(member, second.sessionId);
    expect(await rowsAs(member, "select session_id from public.workout_completions")).toEqual([{ session_id: second.sessionId }]);
    // Same session twice on one day is refused by the unique key.
    expect((await expectError(insert(member, second.sessionId))).code).toBe("23505");
    // Archived plan, another member's plan, or logging on behalf of someone else.
    await expectRlsViolation(insert(member, first.sessionId));
    await expectRlsViolation(insert(member, othersPlan.sessionId));
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query("insert into public.workout_completions (member_id, session_id) values ($1, $2)", [other, othersPlan.sessionId]),
      ),
    );
    // The other member's log is private.
    await insert(other, othersPlan.sessionId);
    expect(await rowsAs(member, "select id from public.workout_completions where member_id = $1", [other])).toEqual([]);
  });

  it("a member whose membership ended can no longer read his plan or log workouts", async () => {
    const lapsed = await createMember("plan-lapsed");
    const plan = await createPlan(lapsed, "Plan");
    await publish(plan.planId);
    expect(await visiblePlans(lapsed)).toHaveLength(1);
    await setSubscription(lapsed, "canceled");
    expect(await visiblePlans(lapsed)).toEqual([]);
    expect(await rowsAs(lapsed, "select id from public.exercises where id = $1", [plan.exerciseId])).toEqual([]);
    await expectRlsViolation(
      asUser(lapsed, (c) => c.query("insert into public.workout_completions (member_id, session_id) values ($1, $2)", [lapsed, plan.sessionId])),
    );
  });

  it("the admin can duplicate a plan into a new draft with all sessions and exercises", async () => {
    const copy = await valueAs<string>(admin, "select public.duplicate_training_plan($1)", [second.planId]);
    const [plan] = await sql("select status, member_id from public.training_plans where id = $1", [copy]);
    expect(plan).toEqual({ status: "draft", member_id: member });
    expect(
      await value<number>(
        "select count(*)::int from public.exercises e join public.training_sessions s on s.id = e.session_id where s.plan_id = $1",
        [copy],
      ),
    ).toBe(1);
  });
});

// -----------------------------------------------------------------------------
describe("nutrition plans", () => {
  let member: string;
  let other: string;
  let planId: string;

  beforeAll(async () => {
    member = await createMember("kost", "Jens Hansen");
    other = await createMember("kost-other", "Ole Olsen");
    planId = await value<string>(
      "insert into public.nutrition_plans (member_id, title, created_by) values ($1, 'Kostplan', $2) returning id",
      [member, admin],
    );
    await sql("insert into public.nutrition_meals (plan_id, meal_type, title) values ($1, 'morgenmad', 'Havregryn')", [planId]);
  });

  it("cannot be published before the member has the add-on", async () => {
    await expectDenied(asUser(admin, (c) => c.query("select public.publish_nutrition_plan($1)", [planId])), /ikke adgang til en kostplan/);
    expect(await value("select status from public.nutrition_plans where id = $1", [planId])).toBe("draft");
  });

  it("members cannot grant themselves the add-on", async () => {
    await expectDenied(asUser(member, (c) => c.query("select public.grant_addon($1, 'kostplan')", [member])), /Kun administratorer/);
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query(
          "insert into public.purchases (user_id, product_id, provider, status) values ($1, (select id from public.products where slug = 'kostplan'), 'manual', 'granted')",
          [member],
        ),
      ),
    );
    expect(await valueAs(member, "select public.has_addon('kostplan')")).toBe(false);
  });

  it("after grant_addon by the admin it can be published, and the member is notified", async () => {
    const purchaseId = await valueAs<string>(admin, "select public.grant_addon($1, 'kostplan', 'Gave')", [member]);
    expect(await value("select status from public.purchases where id = $1", [purchaseId])).toBe("granted");
    expect(await valueAs(member, "select public.has_addon('kostplan')")).toBe(true);
    await expectError(asUser(admin, (c) => c.query("select public.grant_addon($1, 'kostplan')", [member])), /allerede adgang/);
    await asUser(admin, (c) => c.query("select public.publish_nutrition_plan($1)", [planId]));
    expect(await rowsAs(member, "select title, link from public.notifications where type = 'nutrition_plan'")).toEqual([
      { title: "Din kostplan er klar", link: "/min-traening/kostplan" },
    ]);
  });

  it("the member sees his own published plan and meals; others do not", async () => {
    expect(await rowsAs(member, "select id, status from public.nutrition_plans")).toEqual([{ id: planId, status: "published" }]);
    expect(await rowsAs(member, "select title from public.nutrition_meals where plan_id = $1", [planId])).toEqual([{ title: "Havregryn" }]);
    expect(await rowsAs(other, "select id from public.nutrition_plans where id = $1", [planId])).toEqual([]);
    expect(await rowsAs(other, "select id from public.nutrition_meals where plan_id = $1", [planId])).toEqual([]);
  });

  it("a member cannot see his own draft nutrition plan or edit plans", async () => {
    const draft = await value<string>("insert into public.nutrition_plans (member_id, title) values ($1, 'Udkast') returning id", [member]);
    expect(await rowsAs(member, "select id from public.nutrition_plans where id = $1", [draft])).toEqual([]);
    expect(await rowCountAs(member, "update public.nutrition_plans set personal_notes = 'x' where id = $1", [planId])).toBe(0);
    await expectDenied(asUser(member, (c) => c.query("select public.publish_nutrition_plan($1)", [draft])), /Kun administratorer/);
  });
});
