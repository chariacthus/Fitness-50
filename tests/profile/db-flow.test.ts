import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDatabase } from "../db/harness.mjs";

// Verifies the database behaviour the announcement wall, Min profil and the
// admin data-request page rely on, against the real migrations (embedded
// Postgres + Supabase shim). The statements mirror what the pages send.

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
let db: { client: Client; stop: () => Promise<void> };

const COACH = "00000000-0000-4000-8000-0000000000b1";
const JENS = "00000000-0000-4000-8000-0000000000b2";
const OLE = "00000000-0000-4000-8000-0000000000b3";
const FORMER = "00000000-0000-4000-8000-0000000000b4";

async function as<T>(role: "authenticated" | "anon" | "service_role", userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = db.client;
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role } : { role })]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (error) {
    await c.query("rollback");
    throw error;
  }
}

const asUser = <T>(userId: string, fn: (c: Client) => Promise<T>) => as("authenticated", userId, fn);
const rowsAs = async (userId: string, sql: string, params: unknown[] = []) => asUser(userId, async (c) => (await c.query(sql, params)).rows);
const superRows = async (sql: string, params: unknown[] = []) => (await db.client.query(sql, params)).rows;

beforeAll(async () => {
  db = await startDatabase();
  await superRows(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'coach@example.dk', '{"full_name":"Træneren"}'),
       ($2, 'jens@example.dk', '{"full_name":"Jens Hansen"}'),
       ($3, 'ole@example.dk', '{"full_name":"Ole Olsen"}'),
       ($4, 'tidligere@example.dk', '{"full_name":"Tidligere Medlem"}')`,
    [COACH, JENS, OLE, FORMER],
  );
  await superRows("insert into public.user_roles (user_id, role) values ($1, 'admin')", [COACH]);
  await superRows(
    `insert into public.subscriptions (user_id, provider_subscription_id, status, current_period_end, ended_at) values
       ($1, 'sub_jens', 'active', now() + interval '20 days', null),
       ($2, 'sub_ole', 'active', now() + interval '20 days', null),
       ($3, 'sub_former', 'canceled', now() - interval '10 days', now() - interval '10 days')`,
    [JENS, OLE, FORMER],
  );
});

afterAll(async () => {
  await db?.stop();
});

describe("withdrawing health consent", () => {
  it("works for a former member, deletes the health information and only touches his own row", async () => {
    await superRows(
      `insert into public.onboarding_submissions (user_id, status, health_consent, health_info) values
         ($1, 'submitted', true, 'Dårligt knæ'),
         ($2, 'submitted', true, 'Ondt i ryggen')`,
      [FORMER, JENS],
    );
    expect((await rowsAs(FORMER, "select public.membership_state() as s"))[0].s).toBe("expired");

    // The questionnaire itself can no longer be edited after the membership ended …
    const direct = await rowsAs(FORMER, "update public.onboarding_submissions set health_consent = false where user_id = $1 returning id", [FORMER]);
    expect(direct).toHaveLength(0);

    // … but consent can always be withdrawn.
    const [res] = await rowsAs(FORMER, "select public.withdraw_health_consent() as found");
    expect(res.found).toBe(true);
    const [row] = await superRows("select health_consent, health_consent_at, health_info from public.onboarding_submissions where user_id = $1", [FORMER]);
    expect(row).toMatchObject({ health_consent: false, health_consent_at: null, health_info: null });

    const [jens] = await superRows("select health_consent, health_info from public.onboarding_submissions where user_id = $1", [JENS]);
    expect(jens).toMatchObject({ health_consent: true, health_info: "Ondt i ryggen" });
  });

  it("reports when there is nothing to withdraw and is not available to visitors", async () => {
    const [res] = await rowsAs(OLE, "select public.withdraw_health_consent() as found");
    expect(res.found).toBe(false);
    await expect(as("anon", null, (c) => c.query("select public.withdraw_health_consent()"))).rejects.toMatchObject({ code: "42501" });
  });
});

describe("data requests", () => {
  it("forces a member's request to pending, records his e-mail and notifies the administrators", async () => {
    const [request] = await rowsAs(
      JENS,
      "insert into public.data_requests (user_id, type, status, handled_by) values ($1, 'deletion', 'completed', $1) returning id, status, user_email, handled_by",
      [JENS],
    );
    expect(request).toMatchObject({ status: "pending", user_email: "jens@example.dk", handled_by: null });

    const notes = await rowsAs(COACH, "select title, link from public.notifications where type = 'data_request'");
    expect(notes).toEqual([{ title: "Anmodning om sletning af konto", link: "/admin/anmodninger" }]);

    // Other members cannot see it; Jens can cancel it, but not mark it completed.
    expect(await rowsAs(OLE, "select id from public.data_requests")).toHaveLength(0);
    await expect(
      asUser(JENS, (c) => c.query("update public.data_requests set status = 'completed' where id = $1", [request.id])),
    ).rejects.toMatchObject({ code: "42501" });
    const canceled = await rowsAs(
      JENS,
      "update public.data_requests set status = 'canceled' where id = $1 and user_id = $2 and status = 'pending' returning id",
      [request.id, JENS],
    );
    expect(canceled).toHaveLength(1);
  });

  it("does not ask the administrators to act on an export the server logged as completed", async () => {
    const before = (await superRows("select count(*)::int as n from public.notifications where type = 'data_request'"))[0].n;
    await as("service_role", null, (c) =>
      c.query(
        "insert into public.data_requests (user_id, user_email, type, status, completed_at) values ($1, 'ole@example.dk', 'export', 'completed', now())",
        [OLE],
      ),
    );
    const after = (await superRows("select count(*)::int as n from public.notifications where type = 'data_request'"))[0].n;
    expect(after).toBe(before);
    const [row] = await rowsAs(OLE, "select status, type from public.data_requests where user_id = $1", [OLE]);
    expect(row).toEqual({ status: "completed", type: "export" });
  });

  it("lets the administrator mark a request rejected with a note", async () => {
    const [request] = await rowsAs(JENS, "insert into public.data_requests (user_id, type) values ($1, 'deletion') returning id", [JENS]);
    const [updated] = await rowsAs(
      COACH,
      "update public.data_requests set status = 'rejected', note = 'Ikke fra medlemmet', handled_by = $2, completed_at = now() where id = $1 and status = 'pending' returning status, note",
      [request.id, COACH],
    );
    expect(updated).toEqual({ status: "rejected", note: "Ikke fra medlemmet" });
  });

  it("keeps the request (with e-mail) when the account is deleted", async () => {
    const [user] = await superRows("insert into auth.users (email) values ('slet@example.dk') returning id");
    const [request] = await rowsAs(user.id as string, "insert into public.data_requests (user_id, type) values ($1, 'deletion') returning id", [user.id]);
    await superRows("update public.data_requests set status = 'completed', completed_at = now() where id = $1", [request.id]);
    await superRows("delete from auth.users where id = $1", [user.id]);
    const [kept] = await superRows("select user_id, user_email, status from public.data_requests where id = $1", [request.id]);
    expect(kept).toEqual({ user_id: null, user_email: "slet@example.dk", status: "completed" });
    expect(await superRows("select id from public.profiles where id = $1", [user.id])).toHaveLength(0);
  });
});

describe("announcements", () => {
  it("notifies active members (not the coach, not former members) when an important announcement is published", async () => {
    const [a] = await rowsAs(COACH, "insert into public.announcements (title, author_id, is_important) values ('Fælles træning', $1, true) returning id", [COACH]);
    expect(await rowsAs(JENS, "select id from public.announcements where id = $1", [a.id])).toHaveLength(0);

    const [res] = await rowsAs(COACH, "select public.publish_announcement($1) as n", [a.id]);
    expect(res.n).toBe(2);
    const notified = await superRows("select user_id from public.notifications where type = 'announcement' order by user_id");
    expect(notified.map((r) => r.user_id)).toEqual([JENS, OLE]);

    // Published again later: nobody is notified twice.
    await rowsAs(COACH, "update public.announcements set status = 'draft' where id = $1", [a.id]);
    const [again] = await rowsAs(COACH, "select public.publish_announcement($1) as n", [a.id]);
    expect(again.n).toBe(0);

    expect(await rowsAs(JENS, "select id from public.announcements where id = $1", [a.id])).toHaveLength(1);
    expect(await rowsAs(FORMER, "select id from public.announcements")).toHaveLength(0);
  });

  it("hides future-dated announcements from members and sends no notification", async () => {
    const [a] = await rowsAs(
      COACH,
      "insert into public.announcements (title, author_id, is_important, published_at) values ('Senere', $1, true, now() + interval '2 days') returning id",
      [COACH],
    );
    const [res] = await rowsAs(COACH, "select public.publish_announcement($1) as n", [a.id]);
    expect(res.n).toBe(0);
    const [row] = await superRows("select status, notified_at from public.announcements where id = $1", [a.id]);
    expect(row).toEqual({ status: "published", notified_at: null });
    expect(await rowsAs(JENS, "select id from public.announcements where id = $1", [a.id])).toHaveLength(0);
    // The administrator can still preview it.
    expect(await rowsAs(COACH, "select id from public.announcements where id = $1", [a.id])).toHaveLength(1);
  });

  it("refuses announcements and media written by members", async () => {
    await expect(
      asUser(JENS, (c) => c.query("insert into public.announcements (title, author_id) values ('Mit eget', $1)", [JENS])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(JENS, (c) => c.query("select public.publish_announcement(gen_random_uuid())"))).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(JENS, (c) =>
        c.query("insert into public.media (bucket, path, kind, mime_type) values ('announcements', 'x/y.jpg', 'image', 'image/jpeg')"),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("profile", () => {
  it("lets a former member edit his own profile and contact details, but not protected fields", async () => {
    const updated = await rowsAs(FORMER, "update public.profiles set full_name = 'Nyt Navn', bio = 'Om mig' where id = $1 returning id", [FORMER]);
    expect(updated).toHaveLength(1);
    const contact = await rowsAs(
      FORMER,
      "update public.profile_private set phone = '12345678', contact_preference = 'telefon', email_notifications = false where user_id = $1 returning user_id",
      [FORMER],
    );
    expect(contact).toHaveLength(1);
    await expect(
      asUser(FORMER, (c) => c.query("update public.profile_private set email = 'andet@example.dk' where user_id = $1", [FORMER])),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await rowsAs(FORMER, "update public.profiles set bio = 'Hacket' where id = $1 returning id", [JENS])).toHaveLength(0);
  });
});
