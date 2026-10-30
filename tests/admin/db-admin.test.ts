import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDatabase } from "../db/harness.mjs";
import { moveItem } from "@/lib/admin/reorder";

// Runs the statements and RPCs used by the admin server actions against the
// real migrations (embedded Postgres + Supabase shim), as the logged-in
// administrator through Row Level Security – and checks that an ordinary
// member cannot do the same.

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };
let db: { client: Client; stop: () => Promise<void> };

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const OTHER = "00000000-0000-4000-8000-0000000000c3";

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
     values ($1, 'sub_jens', 'active', now() + interval '20 days'), ($2, 'sub_ole', 'active', now() + interval '20 days')`,
    [MEMBER, OTHER],
  );
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe("overview and member list", () => {
  it("lets the administrator read the figures and the member list, but not members", async () => {
    const stats = await asUser(ADMIN, async (c) => (await c.query("select public.admin_overview_stats() as s")).rows[0].s as Record<string, number>);
    expect(Number(stats.total_members)).toBe(2);
    expect(Number(stats.active)).toBe(2);

    const list = await asUser(ADMIN, async (c) => (await c.query("select * from public.admin_member_list('jens')")).rows);
    expect(list.map((r) => r.email)).toEqual(["jens@example.dk"]);

    await expect(asUser(MEMBER, (c) => c.query("select public.admin_overview_stats()"))).rejects.toThrow(/administratorer/);
    await expect(asUser(MEMBER, (c) => c.query("select * from public.admin_member_list(null)"))).rejects.toThrow(/administratorer/);
  });
});

describe("onboarding review", () => {
  it("lets the administrator mark a submitted questionnaire as reviewed", async () => {
    await asUser(MEMBER, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, status, answers) values ($1, 'submitted', '{}')", [MEMBER]),
    );
    const updated = await asUser(ADMIN, async (c) =>
      (
        await c.query(
          `update public.onboarding_submissions set status = 'reviewed', reviewed_at = now(), reviewed_by = $1
           where user_id = $2 and status = 'submitted' returning id, reviewed_by`,
          [ADMIN, MEMBER],
        )
      ).rows,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].reviewed_by).toBe(ADMIN);
  });
});

describe("training plan editor", () => {
  let planId = "";
  const sessions: string[] = [];
  let exerciseId = "";

  it("creates a draft that the member cannot see", async () => {
    planId = await asUser(ADMIN, async (c) =>
      (
        await c.query("insert into public.training_plans (member_id, title, status, created_by) values ($1, 'Styrke', 'draft', $2) returning id", [
          MEMBER,
          ADMIN,
        ])
      ).rows[0].id as string,
    );
    const visible = await asUser(MEMBER, async (c) => (await c.query("select id from public.training_plans")).rows);
    expect(visible).toHaveLength(0);
  });

  it("adds, reorders and edits training days and exercises", async () => {
    for (const [title, position] of [["Dag A", 0], ["Dag B", 1], ["Dag C", 2]] as const) {
      sessions.push(
        await asUser(ADMIN, async (c) =>
          (await c.query("insert into public.training_sessions (plan_id, title, position) values ($1, $2, $3) returning id", [planId, title, position]))
            .rows[0].id as string,
        ),
      );
    }
    const rows = (await db.client.query("select id, position, created_at from public.training_sessions where plan_id = $1", [planId])).rows as {
      id: string;
      position: number;
      created_at: string;
    }[];
    const updates = moveItem(rows, sessions[2], "up");
    await asUser(ADMIN, async (c) => {
      for (const u of updates) await c.query("update public.training_sessions set position = $1 where id = $2", [u.position, u.id]);
    });
    const order = (await db.client.query("select title from public.training_sessions where plan_id = $1 order by position", [planId])).rows.map(
      (r) => r.title,
    );
    expect(order).toEqual(["Dag A", "Dag C", "Dag B"]);

    exerciseId = await asUser(ADMIN, async (c) =>
      (
        await c.query(
          "insert into public.exercises (session_id, name, sets, reps, video_url, position) values ($1, 'Squat', 3, '8-12', 'https://example.com/v', 0) returning id",
          [sessions[0]],
        )
      ).rows[0].id as string,
    );
    await expect(
      asUser(ADMIN, (c) => c.query("update public.exercises set video_url = 'http://example.com/v' where id = $1", [exerciseId])),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("stores an uploaded video as media and links it to the exercise", async () => {
    const mediaId = await asUser(ADMIN, async (c) =>
      (
        await c.query(
          `insert into public.media (owner_id, bucket, path, kind, mime_type, size_bytes, title)
           values ($1, 'training-media', 'exercises/123e4567-e89b-42d3-a456-426614174000.mp4', 'video', 'video/mp4', 1234, 'squat.mp4') returning id`,
          [ADMIN],
        )
      ).rows[0].id as string,
    );
    await asUser(ADMIN, (c) => c.query("update public.exercises set media_id = $1 where id = $2", [mediaId, exerciseId]));
    const { rows } = await db.client.query("select media_id from public.exercises where id = $1", [exerciseId]);
    expect(rows[0].media_id).toBe(mediaId);

    await expect(
      asUser(MEMBER, (c) =>
        c.query(
          `insert into public.media (owner_id, bucket, path, kind, mime_type) values ($1, 'training-media', 'exercises/x.mp4', 'video', 'video/mp4')`,
          [MEMBER],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("publishes the plan, then copies it into a new draft and archives the published one", async () => {
    await asUser(ADMIN, (c) => c.query("select public.publish_training_plan($1)", [planId]));
    const visible = await asUser(MEMBER, async (c) => (await c.query("select id, status from public.training_plans")).rows);
    expect(visible).toEqual([{ id: planId, status: "published" }]);

    const copyId = await asUser(ADMIN, async (c) => (await c.query("select public.duplicate_training_plan($1) as id", [planId])).rows[0].id as string);
    const copied = (await db.client.query(
      "select count(*)::int as n from public.exercises e join public.training_sessions s on s.id = e.session_id where s.plan_id = $1 and e.media_id is not null",
      [copyId],
    )).rows[0].n;
    expect(copied).toBe(1);

    await asUser(ADMIN, (c) => c.query("select public.archive_training_plan($1)", [planId]));
    const { rows } = await db.client.query("select status from public.training_plans where id = $1", [planId]);
    expect(rows[0].status).toBe("archived");

    const deleted = await asUser(ADMIN, async (c) =>
      (await c.query("delete from public.training_plans where id = $1 and status = 'draft' returning id", [copyId])).rows,
    );
    expect(deleted).toHaveLength(1);
  });

  it("refuses to publish a plan without training days, with a Danish message", async () => {
    const empty = await asUser(ADMIN, async (c) =>
      (await c.query("insert into public.training_plans (member_id, title) values ($1, 'Tom') returning id", [OTHER])).rows[0].id as string,
    );
    await expect(asUser(ADMIN, (c) => c.query("select public.publish_training_plan($1)", [empty]))).rejects.toThrow(/mindst én træningsdag/);
  });
});

describe("nutrition plans and the add-on", () => {
  let planId = "";

  it("refuses to publish without the add-on and allows it after an explicit grant", async () => {
    planId = await asUser(ADMIN, async (c) =>
      (await c.query("insert into public.nutrition_plans (member_id, title, created_by) values ($1, 'Kost', $2) returning id", [MEMBER, ADMIN])).rows[0]
        .id as string,
    );
    await asUser(ADMIN, (c) =>
      c.query("insert into public.nutrition_meals (plan_id, meal_type, title, position) values ($1, 'frokost', 'Rugbrød', 0)", [planId]),
    );
    await expect(asUser(ADMIN, (c) => c.query("select public.publish_nutrition_plan($1)", [planId]))).rejects.toThrow(/ikke adgang til en kostplan/);

    await expect(asUser(MEMBER, (c) => c.query("select public.grant_addon($1, 'kostplan', null)", [MEMBER]))).rejects.toThrow(/administratorer/);
    await asUser(ADMIN, (c) => c.query("select public.grant_addon($1, 'kostplan', 'Gave')", [MEMBER]));
    const { rows } = await db.client.query("select status, granted_by, provider from public.purchases where user_id = $1", [MEMBER]);
    expect(rows).toEqual([{ status: "granted", granted_by: ADMIN, provider: "manual" }]);

    await asUser(ADMIN, (c) => c.query("select public.publish_nutrition_plan($1)", [planId]));
    const visible = await asUser(MEMBER, async (c) => (await c.query("select title from public.nutrition_meals")).rows);
    expect(visible).toEqual([{ title: "Rugbrød" }]);
  });

  it("copies a plan and its meals into a new draft", async () => {
    const copy = await asUser(ADMIN, async (c) => {
      const id = (
        await c.query(
          `insert into public.nutrition_plans (member_id, title, intro, status, created_by)
           select member_id, title, intro, 'draft', $2 from public.nutrition_plans where id = $1 returning id`,
          [planId, ADMIN],
        )
      ).rows[0].id as string;
      await c.query(
        "insert into public.nutrition_meals (plan_id, meal_type, title, description, position) select $2, meal_type, title, description, position from public.nutrition_meals where plan_id = $1",
        [planId, id],
      );
      return id;
    });
    const { rows } = await db.client.query("select count(*)::int as n from public.nutrition_meals where plan_id = $1", [copy]);
    expect(rows[0].n).toBe(1);
  });
});

describe("moderation", () => {
  it("hides a reported message, pauses and restores community access and resolves the report – all logged", async () => {
    const messageId = await asUser(OTHER, async (c) =>
      (await c.query("insert into public.community_messages (author_id, body) values ($1, 'Grim besked') returning id", [OTHER])).rows[0].id as string,
    );
    const reportId = await asUser(MEMBER, async (c) =>
      (await c.query("select public.report_content('community_message', $1, 'Uhøflig') as id", [messageId])).rows[0].id as string,
    );

    await asUser(ADMIN, async (c) => {
      await c.query("select public.moderate_community_message($1, true, 'Uhøflig tone')", [messageId]);
      await c.query("select public.set_community_suspension($1, true, 'Gentagne overtrædelser')", [OTHER]);
      await c.query("select public.resolve_report($1, 'resolved', 'Skjult')", [reportId]);
    });

    const hidden = await asUser(MEMBER, async (c) => (await c.query("select id from public.community_messages where id = $1", [messageId])).rows);
    expect(hidden).toHaveLength(0);
    const { rows: profile } = await db.client.query(
      "select p.community_suspended, pp.suspension_reason from public.profiles p join public.profile_private pp on pp.user_id = p.id where p.id = $1",
      [OTHER],
    );
    expect(profile[0]).toEqual({ community_suspended: true, suspension_reason: "Gentagne overtrædelser" });

    await asUser(ADMIN, (c) => c.query("select public.set_community_suspension($1, false, null)", [OTHER]));
    const { rows: log } = await db.client.query("select action from public.moderation_actions order by created_at, action");
    expect(log.map((r) => r.action).sort()).toEqual(["hide_message", "resolve_report", "restore_user", "suspend_user"]);

    await expect(asUser(ADMIN, (c) => c.query("select public.set_community_suspension($1, true, 'x')", [ADMIN]))).rejects.toThrow(/kan ikke suspenderes/);
  });
});

describe("contact messages and settings", () => {
  it("lets the administrator mark a contact message as handled", async () => {
    const { rows } = await db.client.query(
      "insert into public.contact_messages (name, email, message) values ('Karl', 'karl@example.dk', 'Hej') returning id",
    );
    const updated = await asUser(ADMIN, async (c) =>
      (
        await c.query("update public.contact_messages set handled_at = now(), handled_by = $1 where id = $2 and handled_at is null returning id", [
          ADMIN,
          rows[0].id,
        ])
      ).rows,
    );
    expect(updated).toHaveLength(1);
    const member = await asUser(MEMBER, async (c) => (await c.query("select id from public.contact_messages")).rows);
    expect(member).toHaveLength(0);
  });

  it("lets only the administrator change site and admin settings", async () => {
    const site = await asUser(ADMIN, async (c) =>
      (
        await c.query("update public.site_settings set brand_color = '#3A4A2B', coach_user_id = $1, updated_by = $1 where id = 1 returning id", [ADMIN])
      ).rows,
    );
    expect(site).toHaveLength(1);
    const ops = await asUser(ADMIN, async (c) =>
      (await c.query("update public.admin_settings set max_video_mb = 50, grace_period_days = 5 where id = 1 returning id")).rows,
    );
    expect(ops).toHaveLength(1);

    const memberSite = await asUser(MEMBER, async (c) => (await c.query("update public.site_settings set business_name = 'Hacket' where id = 1 returning id")).rows);
    expect(memberSite).toHaveLength(0);
    const memberOps = await asUser(MEMBER, async (c) => (await c.query("select * from public.admin_settings")).rows);
    expect(memberOps).toHaveLength(0);

    await expect(
      asUser(ADMIN, (c) => c.query("update public.site_settings set brand_color = 'grøn' where id = 1")),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
