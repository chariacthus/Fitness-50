import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDatabase } from "../db/harness.mjs";

// Verifies the database behaviour the community, private messages, profile
// and notification pages rely on, against the real migrations (embedded
// Postgres + Supabase shim). The queries mirror what the pages send.

type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
let db: { client: Client; stop: () => Promise<void> };

const COACH = "00000000-0000-4000-8000-0000000000a1";
const JENS = "00000000-0000-4000-8000-0000000000a2";
const OLE = "00000000-0000-4000-8000-0000000000a3";
const OUTSIDER = "00000000-0000-4000-8000-0000000000a4";
const FAST = "00000000-0000-4000-8000-0000000000a5";

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

const rowsAs = async (userId: string, sql: string, params: unknown[] = []) => asUser(userId, async (c) => (await c.query(sql, params)).rows);

beforeAll(async () => {
  db = await startDatabase();
  const c = db.client;
  await c.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'coach@example.dk', '{"full_name":"Træneren"}'),
       ($2, 'jens@example.dk', '{"full_name":"Jens Hansen"}'),
       ($3, 'ole@example.dk', '{"full_name":"Ole Olsen"}'),
       ($4, 'udenfor@example.dk', '{"full_name":"Uden Medlemskab"}'),
       ($5, 'hurtig@example.dk', '{"full_name":"Hurtig Skriver"}')`,
    [COACH, JENS, OLE, OUTSIDER, FAST],
  );
  await c.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [COACH]);
  await c.query("update public.site_settings set coach_user_id = $1 where id = 1", [COACH]);
  await c.query(
    `insert into public.subscriptions (user_id, provider_subscription_id, status, current_period_end) values
       ($1, 'sub_jens', 'active', now() + interval '20 days'),
       ($2, 'sub_ole', 'active', now() + interval '20 days'),
       ($3, 'sub_fast', 'active', now() + interval '20 days')`,
    [JENS, OLE, FAST],
  );
});

afterAll(async () => {
  await db?.stop();
});

describe("community chat", () => {
  const first = "10000000-0000-4000-8000-000000000001";
  const reply = "10000000-0000-4000-8000-000000000002";

  it("tells the page who may use the community", async () => {
    const check = async (u: string) => (await rowsAs(u, "select public.can_use_community() as ok"))[0].ok;
    expect(await check(JENS)).toBe(true);
    expect(await check(COACH)).toBe(true);
    expect(await check(OUTSIDER)).toBe(false);
  });

  it("lets a member post with a browser-generated id and reply to a message", async () => {
    await asUser(JENS, (c) =>
      c.query("insert into public.community_messages (id, author_id, body) values ($1, $2, 'Hej alle sammen')", [first, JENS]),
    );
    await asUser(OLE, (c) =>
      c.query("insert into public.community_messages (id, author_id, body, reply_to_id) values ($1, $2, 'Velkommen, Jens', $3)", [
        reply,
        OLE,
        first,
      ]),
    );
    const rows = await rowsAs(
      OLE,
      "select id, reply_to_id from public.community_messages where hidden_at is null order by created_at desc limit 50",
    );
    expect(rows.map((r) => r.id)).toEqual([reply, first]);
    expect(rows[0].reply_to_id).toBe(first);
  });

  it("refuses posts in someone else's name, images in someone else's folder and posts from non-members", async () => {
    await expect(
      asUser(JENS, (c) => c.query("insert into public.community_messages (author_id, body) values ($1, 'Falsk')", [OLE])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(JENS, (c) =>
        c.query("insert into public.community_messages (author_id, body, image_path) values ($1, '', $2)", [JENS, `${OLE}/billede.jpg`]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(OUTSIDER, (c) => c.query("insert into public.community_messages (author_id, body) values ($1, 'Hej')", [OUTSIDER])),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await rowsAs(OUTSIDER, "select id from public.community_messages")).toHaveLength(0);
  });

  it("soft-deletes own messages (text cleared by the trigger) and ignores attempts on others' messages", async () => {
    const updated = await rowsAs(
      OLE,
      "update public.community_messages set deleted_at = now() where id = $1 returning id",
      [first],
    );
    expect(updated).toHaveLength(0);

    const [row] = await rowsAs(
      JENS,
      "update public.community_messages set deleted_at = now() where id = $1 returning body, deleted_at, image_path",
      [first],
    );
    expect(row.body).toBe("");
    expect(row.deleted_at).not.toBeNull();
    // The reply still points at the deleted message, so the quote can say "Beskeden er slettet".
    const [quoted] = await rowsAs(OLE, "select reply_to_id from public.community_messages where id = $1", [reply]);
    expect(quoted.reply_to_id).toBe(first);
  });

  it("stores when the member last read the chat", async () => {
    expect(await rowsAs(JENS, "select last_read_at from public.community_reads where user_id = $1", [JENS])).toHaveLength(0);
    await asUser(JENS, (c) => c.query("select public.mark_community_read()"));
    expect(await rowsAs(JENS, "select last_read_at from public.community_reads where user_id = $1", [JENS])).toHaveLength(1);
  });

  it("returns the Danish rate-limit message when someone posts too fast", async () => {
    for (let i = 0; i < 20; i += 1) {
      await asUser(FAST, (c) => c.query("insert into public.community_messages (author_id, body) values ($1, $2)", [FAST, `Besked ${i}`]));
    }
    await expect(
      asUser(FAST, (c) => c.query("insert into public.community_messages (author_id, body) values ($1, 'En for meget')", [FAST])),
    ).rejects.toMatchObject({ code: "P0001", message: expect.stringMatching(/meget hurtigt/) });
  });

  it("lets members report a community message and notifies the administrator", async () => {
    await asUser(JENS, (c) => c.query("select public.report_content('community_message', $1, 'Upassende')", [reply]));
    const reports = await db.client.query("select snapshot, target_user_id from public.reports where target_id = $1", [reply]);
    expect(reports.rows[0]).toMatchObject({ snapshot: "Velkommen, Jens", target_user_id: OLE });
    const notes = await db.client.query("select link from public.notifications where user_id = $1 and type = 'report'", [COACH]);
    expect(notes.rows[0].link).toBe("/admin/rapporter");
  });
});

describe("private messages", () => {
  let conversation = "";
  const message = "20000000-0000-4000-8000-000000000001";

  it("creates one direct conversation per pair (rpc get_or_create_direct_conversation)", async () => {
    const [a] = await rowsAs(JENS, "select public.get_or_create_direct_conversation($1) as id", [OLE]);
    const [b] = await rowsAs(OLE, "select public.get_or_create_direct_conversation($1) as id", [JENS]);
    conversation = a.id as string;
    expect(b.id).toBe(conversation);
  });

  it("explains in Danish when a conversation cannot be started", async () => {
    await expect(asUser(OUTSIDER, (c) => c.query("select public.get_or_create_direct_conversation($1)", [COACH]))).rejects.toThrow(
      /aktivt medlemskab/,
    );
    await expect(asUser(JENS, (c) => c.query("select public.get_or_create_direct_conversation($1)", [OUTSIDER]))).rejects.toThrow(
      /ikke skrive til denne person/,
    );
    await expect(asUser(JENS, (c) => c.query("select public.get_or_create_direct_conversation($1)", [JENS]))).rejects.toThrow(
      /anden person/,
    );
  });

  it("only shows the conversation to its participants (the page returns 404 otherwise)", async () => {
    expect(await rowsAs(JENS, "select user_id from public.conversation_participants where conversation_id = $1", [conversation])).toHaveLength(2);
    expect(await rowsAs(OUTSIDER, "select user_id from public.conversation_participants where conversation_id = $1", [conversation])).toHaveLength(0);
    expect(await rowsAs(COACH, "select user_id from public.conversation_participants where conversation_id = $1", [conversation])).toHaveLength(0);
  });

  it("saves a message with a browser-generated id, refuses a duplicate retry and notifies without the text", async () => {
    await asUser(JENS, (c) =>
      c.query("insert into public.private_messages (id, conversation_id, sender_id, body) values ($1, $2, $3, 'Hemmelig plan')", [
        message,
        conversation,
        JENS,
      ]),
    );
    await expect(
      asUser(JENS, (c) =>
        c.query("insert into public.private_messages (id, conversation_id, sender_id, body) values ($1, $2, $3, 'Hemmelig plan')", [
          message,
          conversation,
          JENS,
        ]),
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const [note] = await rowsAs(OLE, "select id, title, body, link, read_at from public.notifications where user_id = $1 and type = 'message'", [OLE]);
    expect(note.link).toBe(`/beskeder/${conversation}`);
    expect(String(note.body)).not.toMatch(/Hemmelig/);

    const [inbox] = await rowsAs(OLE, "select * from public.my_conversations()");
    expect(inbox).toMatchObject({ conversation_id: conversation, other_user_id: JENS, other_name: "Jens Hansen", last_message_body: "Hemmelig plan" });
    expect(Number(inbox.unread_count)).toBe(1);
  });

  it("marks the conversation and its notification as read", async () => {
    await asUser(OLE, (c) => c.query("select public.mark_conversation_read($1)", [conversation]));
    const [inbox] = await rowsAs(OLE, "select unread_count from public.my_conversations()");
    expect(Number(inbox.unread_count)).toBe(0);
    const [note] = await rowsAs(OLE, "select read_at from public.notifications where user_id = $1 and type = 'message'", [OLE]);
    expect(note.read_at).not.toBeNull();
  });

  it("only lets participants report a private message", async () => {
    await expect(
      asUser(OUTSIDER, (c) => c.query("select public.report_content('private_message', $1, 'Spam')", [message])),
    ).rejects.toThrow(/ikke fundet/);
    await asUser(OLE, (c) => c.query("select public.report_content('private_message', $1, 'Ubehageligt')", [message]));
    const { rows } = await db.client.query("select snapshot from public.reports where target_id = $1", [message]);
    expect(rows[0].snapshot).toBe("Hemmelig plan");
  });

  it("lets only the sender soft-delete a message", async () => {
    await expect(
      asUser(OLE, async (c) => (await c.query("update public.private_messages set deleted_at = now() where id = $1 returning id", [message])).rows),
    ).resolves.toHaveLength(0);
    const [row] = await rowsAs(JENS, "update public.private_messages set deleted_at = now() where id = $1 returning body, deleted_at", [message]);
    expect(row.body).toBe("");
    expect(row.deleted_at).not.toBeNull();
  });

  it("keeps a suspended member out of the community but lets him write to the coach", async () => {
    await asUser(COACH, (c) => c.query("select public.set_community_suspension($1, true, 'Test')", [JENS]));
    expect((await rowsAs(JENS, "select public.can_use_community() as ok"))[0].ok).toBe(false);
    expect((await rowsAs(JENS, "select public.can_send_private_message($1) as ok", [conversation]))[0].ok).toBe(false);

    const [coachConversation] = await rowsAs(JENS, "select public.get_or_create_direct_conversation($1) as id", [COACH]);
    expect((await rowsAs(JENS, "select public.can_send_private_message($1) as ok", [coachConversation.id]))[0].ok).toBe(true);
    // The coach sees the conversation as a participant (used by /admin/beskeder).
    const inbox = await rowsAs(COACH, "select conversation_id, other_user_id from public.my_conversations()");
    expect(inbox).toContainEqual({ conversation_id: coachConversation.id, other_user_id: JENS });

    await asUser(COACH, (c) => c.query("select public.set_community_suspension($1, false)", [JENS]));
    expect((await rowsAs(JENS, "select public.can_use_community() as ok"))[0].ok).toBe(true);
  });
});

describe("profiles and notifications", () => {
  it("shows member profiles to members and the coach profile to everyone logged in", async () => {
    expect(await rowsAs(JENS, "select id from public.profiles where id = $1", [OLE])).toHaveLength(1);
    expect(await rowsAs(OUTSIDER, "select id from public.profiles where id = $1", [OLE])).toHaveLength(0);
    expect(await rowsAs(OUTSIDER, "select id from public.profiles where id = $1", [COACH])).toHaveLength(1);
  });

  it("lets members report a visible profile", async () => {
    await asUser(OLE, (c) => c.query("select public.report_content('profile', $1, 'Falsk profil')", [JENS]));
    const { rows } = await db.client.query("select target_user_id from public.reports where target_type = 'profile'");
    expect(rows[0].target_user_id).toBe(JENS);
  });

  it("marks one or all notifications as read – only the member's own", async () => {
    await db.client.query(
      `insert into public.notifications (user_id, type, title, link) values
         ($1, 'system', 'En', '/hjem'), ($1, 'system', 'To', null), ($2, 'system', 'Oles', '/hjem')`,
      [JENS, OLE],
    );
    const [one] = await rowsAs(JENS, "select id from public.notifications where user_id = $1 and title = 'En'", [JENS]);
    const [oles] = await db.client.query("select id from public.notifications where user_id = $1 and title = 'Oles'", [OLE]).then((r) => r.rows);

    expect((await rowsAs(JENS, "select public.mark_notifications_read(array[$1]::uuid[]) as n", [oles.id]))[0].n).toBe(0);
    expect((await rowsAs(JENS, "select public.mark_notifications_read(array[$1]::uuid[]) as n", [one.id]))[0].n).toBe(1);
    expect(await rowsAs(JENS, "select id from public.notifications where id = $1", [oles.id])).toHaveLength(0);

    const [all] = await rowsAs(JENS, "select public.mark_notifications_read() as n");
    expect(Number(all.n)).toBeGreaterThanOrEqual(1);
    const unread = await rowsAs(JENS, "select id from public.notifications where user_id = $1 and read_at is null", [JENS]);
    expect(unread).toHaveLength(0);
  });

  it("lists members for the coach's picker, but never for members", async () => {
    const members = await rowsAs(COACH, "select id, is_admin from public.admin_member_list(null)");
    expect(members.map((m) => m.id)).toEqual(expect.arrayContaining([JENS, OLE, OUTSIDER]));
    await expect(asUser(JENS, (c) => c.query("select * from public.admin_member_list(null)"))).rejects.toThrow(/administratorer/);
  });
});
