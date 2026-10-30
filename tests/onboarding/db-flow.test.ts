import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDatabase } from "../db/harness.mjs";

// Verifies the database behaviour the onboarding and training pages rely on,
// against the real migrations (embedded Postgres + Supabase shim):
// draft → submitted → draft → submitted, consent rules, admin notifications,
// and Row Level Security for workout completions.

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
let db: { client: Client; stop: () => Promise<void> };

const ADMIN = "00000000-0000-4000-8000-000000000001";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";

/** Runs statements as a logged-in user (role authenticated + JWT claims), rolled back on error. */
async function asUser<T>(userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = db.client;
  await c.query("begin");
  try {
    await c.query("set local role authenticated");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (error) {
    await c.query("rollback");
    throw error;
  }
}

async function adminNotifications() {
  const { rows } = await db.client.query(
    "select count(*)::int as n from public.notifications where user_id = $1 and type = 'onboarding'",
    [ADMIN],
  );
  return rows[0].n as number;
}

beforeAll(async () => {
  db = await startDatabase();
  const c = db.client;
  await c.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'coach@example.dk', '{"full_name":"Coach"}'),
       ($2, 'jens@example.dk', '{"full_name":"Jens Hansen"}'),
       ($3, 'ole@example.dk', '{"full_name":"Ole Olsen"}')`,
    [ADMIN, MEMBER, OTHER],
  );
  await c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ADMIN]);
  await c.query(
    `insert into public.subscriptions (user_id, provider_subscription_id, status, current_period_end)
     values ($1, 'sub_member', 'active', now() + interval '20 days'), ($2, 'sub_other', 'active', now() + interval '20 days')`,
    [MEMBER, OTHER],
  );
});

afterAll(async () => {
  await db?.stop();
});

describe("onboarding submission (RLS + triggers)", () => {
  it("lets a member save a draft of his own questionnaire", async () => {
    await asUser(MEMBER, (c) =>
      c.query(
        `insert into public.onboarding_submissions (user_id, status, current_step, answers)
         values ($1, 'draft', 2, '{"full_name":"Jens Hansen"}')`,
        [MEMBER],
      ),
    );
    const { rows } = await db.client.query("select onboarding_status from public.profiles where id = $1", [MEMBER]);
    expect(rows[0].onboarding_status).toBe("in_progress");
    expect(await adminNotifications()).toBe(0);
  });

  it("refuses health information without consent and keeps it with consent", async () => {
    await expect(
      asUser(MEMBER, (c) =>
        c.query("update public.onboarding_submissions set health_info = 'Ondt i knæet', health_consent = false where user_id = $1", [MEMBER]),
      ),
    ).resolves.toBeDefined();
    // The trigger removes the text when there is no consent.
    let { rows } = await db.client.query("select health_info from public.onboarding_submissions where user_id = $1", [MEMBER]);
    expect(rows[0].health_info).toBeNull();

    await asUser(MEMBER, (c) =>
      c.query("update public.onboarding_submissions set health_info = 'Ondt i knæet', health_consent = true where user_id = $1", [MEMBER]),
    );
    ({ rows } = await db.client.query("select health_info, health_consent_at from public.onboarding_submissions where user_id = $1", [MEMBER]));
    expect(rows[0].health_info).toBe("Ondt i knæet");
    expect(rows[0].health_consent_at).not.toBeNull();
  });

  it("notifies administrators when the questionnaire is sent", async () => {
    await asUser(MEMBER, (c) =>
      c.query("update public.onboarding_submissions set status = 'submitted', current_step = 8 where user_id = $1", [MEMBER]),
    );
    expect(await adminNotifications()).toBe(1);
    const { rows } = await db.client.query("select onboarding_status from public.profiles where id = $1", [MEMBER]);
    expect(rows[0].onboarding_status).toBe("submitted");
  });

  it("does not notify twice for a repeated submit", async () => {
    await asUser(MEMBER, (c) =>
      c.query("update public.onboarding_submissions set status = 'submitted' where user_id = $1", [MEMBER]),
    );
    expect(await adminNotifications()).toBe(1);
  });

  it("never lets a member mark the questionnaire as reviewed", async () => {
    await expect(
      asUser(MEMBER, (c) => c.query("update public.onboarding_submissions set status = 'reviewed' where user_id = $1", [MEMBER])),
    ).rejects.toThrow(/gennemgået/);
  });

  it("lets the member reopen a reviewed questionnaire and notifies again when it is sent again", async () => {
    await db.client.query("update public.onboarding_submissions set status = 'reviewed', reviewed_at = now() where user_id = $1", [MEMBER]);
    await asUser(MEMBER, (c) =>
      c.query(
        "update public.onboarding_submissions set status = 'draft', current_step = 8 where user_id = $1 and status in ('submitted', 'reviewed')",
        [MEMBER],
      ),
    );
    let { rows } = await db.client.query("select status, submitted_at from public.onboarding_submissions where user_id = $1", [MEMBER]);
    expect(rows[0].status).toBe("draft");
    expect(rows[0].submitted_at).not.toBeNull();

    await asUser(MEMBER, (c) => c.query("update public.onboarding_submissions set status = 'submitted' where user_id = $1", [MEMBER]));
    expect(await adminNotifications()).toBe(2);
    ({ rows } = await db.client.query("select status from public.onboarding_submissions where user_id = $1", [MEMBER]));
    expect(rows[0].status).toBe("submitted");
  });

  it("keeps members from seeing each other's answers", async () => {
    const rows = await asUser(OTHER, async (c) => (await c.query("select * from public.onboarding_submissions")).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("workout completions (RLS)", () => {
  let publishedSession = "";
  let draftSession = "";
  let otherSession = "";

  beforeAll(async () => {
    const c = db.client;
    const plan = await c.query(
      "insert into public.training_plans (member_id, title, status, published_at) values ($1, 'Plan', 'published', now()) returning id",
      [MEMBER],
    );
    const draft = await c.query("insert into public.training_plans (member_id, title, status) values ($1, 'Kladde', 'draft') returning id", [MEMBER]);
    const other = await c.query(
      "insert into public.training_plans (member_id, title, status, published_at) values ($1, 'Oles plan', 'published', now()) returning id",
      [OTHER],
    );
    const s = async (planId: unknown) =>
      (await c.query("insert into public.training_sessions (plan_id, title, position) values ($1, 'Træning', 0) returning id", [planId])).rows[0]
        .id as string;
    publishedSession = await s(plan.rows[0].id);
    draftSession = await s(draft.rows[0].id);
    otherSession = await s(other.rows[0].id);
  });

  it("lets a member mark a session of his published plan as done – once per day", async () => {
    await asUser(MEMBER, (c) =>
      c.query("insert into public.workout_completions (member_id, session_id, completed_on) values ($1, $2, '2026-10-30')", [MEMBER, publishedSession]),
    );
    await expect(
      asUser(MEMBER, (c) =>
        c.query("insert into public.workout_completions (member_id, session_id, completed_on) values ($1, $2, '2026-10-30')", [
          MEMBER,
          publishedSession,
        ]),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses sessions from draft plans and from other members' plans", async () => {
    for (const session of [draftSession, otherSession]) {
      await expect(
        asUser(MEMBER, (c) =>
          c.query("insert into public.workout_completions (member_id, session_id, completed_on) values ($1, $2, '2026-10-30')", [MEMBER, session]),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("only shows the member his own sessions and lets him undo today's mark", async () => {
    const visible = await asUser(MEMBER, async (c) => (await c.query("select id from public.training_sessions")).rows.map((r) => r.id));
    expect(visible).toEqual([publishedSession]);

    const deleted = await asUser(OTHER, async (c) =>
      (await c.query("delete from public.workout_completions where session_id = $1 returning id", [publishedSession])).rows,
    );
    expect(deleted).toHaveLength(0);

    const undone = await asUser(MEMBER, async (c) =>
      (
        await c.query(
          "delete from public.workout_completions where member_id = $1 and session_id = $2 and completed_on = '2026-10-30' returning id",
          [MEMBER, publishedSession],
        )
      ).rows,
    );
    expect(undone).toHaveLength(1);
  });
});
