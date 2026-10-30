import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asService,
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

// Community feed, private messages and reports.

let admin: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin("coach", "Træneren");
});
afterAll(teardownDatabase);

const post = (userId: string, body: string, extra: { image_path?: string; author_id?: string; is_system?: boolean } = {}) =>
  asUser(userId, async (c) => {
    const { rows } = await c.query(
      `insert into public.community_messages (author_id, body, image_path, is_system)
       values ($1, $2, $3, $4) returning id, created_at`,
      [extra.author_id ?? userId, body, extra.image_path ?? null, extra.is_system ?? false],
    );
    return rows[0] as { id: string; created_at: Date };
  });

const feed = (userId: string) => rowsAs<{ id: string; body: string }>(userId, "select id, body from public.community_messages order by created_at");

async function suspend(userId: string) {
  await asUser(admin, (c) => c.query("select public.set_community_suspension($1, true, 'Gentagne overtrædelser')", [userId]));
}

// -----------------------------------------------------------------------------
describe("community", () => {
  let jens: string;
  let ole: string;
  let outsider: string;
  let suspended: string;

  beforeAll(async () => {
    jens = await createMember("jens", "Jens Hansen");
    ole = await createMember("ole", "Ole Olsen");
    outsider = await createUser(uniqueEmail("outsider"), "Uden Medlemskab");
    suspended = await createMember("suspended", "Suspenderet");
    await suspend(suspended);
  });

  it("an entitled member posts and reads the feed", async () => {
    const { id } = await post(jens, "Godmorgen alle sammen");
    expect((await feed(ole)).map((m) => m.id)).toContain(id);
    expect(await valueAs(jens, "select public.can_use_community()")).toBe(true);
  });

  it("a member without membership cannot read or post", async () => {
    expect(await feed(outsider)).toEqual([]);
    await expectRlsViolation(post(outsider, "Hej"));
    const lapsed = await createMember("lapsed");
    await setSubscription(lapsed, "past_due", { payment_failed_at: new Date(Date.now() - 10 * 86400_000) });
    expect(await feed(lapsed)).toEqual([]);
    await expectRlsViolation(post(lapsed, "Hej"));
  });

  it("a suspended member cannot read or post", async () => {
    expect(await valueAs(suspended, "select public.can_use_community()")).toBe(false);
    expect(await feed(suspended)).toEqual([]);
    await expectRlsViolation(post(suspended, "Hej"));
  });

  it("suspension is admin-only, cannot target admins, and is logged and notified", async () => {
    await expectDenied(asUser(jens, (c) => c.query("select public.set_community_suspension($1, true)", [ole])), /Kun administratorer/);
    await expectError(asUser(admin, (c) => c.query("select public.set_community_suspension($1, true)", [admin])), /kan ikke suspenderes/);
    const [row] = await sql(
      "select p.community_suspended, pp.suspension_reason from public.profiles p join public.profile_private pp on pp.user_id = p.id where p.id = $1",
      [suspended],
    );
    expect(row).toEqual({ community_suspended: true, suspension_reason: "Gentagne overtrædelser" });
    expect(await value("select count(*)::int from public.moderation_actions where action = 'suspend_user' and target_user_id = $1", [suspended])).toBe(1);
    expect(await rowsAs(suspended, "select type from public.notifications")).toEqual([{ type: "system" }]);
  });

  it("a member cannot post as someone else or as a system message", async () => {
    await expectRlsViolation(post(jens, "Jeg er Ole", { author_id: ole }));
    await expectRlsViolation(post(jens, "Officiel besked", { is_system: true }));
    await expectRlsViolation(
      asUser(jens, (c) => c.query("insert into public.community_messages (author_id, body, hidden_at) values ($1, 'x', now())", [jens])),
    );
  });

  it("the server time is used for created_at (no back- or future-dating)", async () => {
    const id = await asUser(jens, async (c) => {
      const { rows } = await c.query(
        "insert into public.community_messages (author_id, body, created_at) values ($1, 'Fremtiden', '2099-01-01') returning id",
        [jens],
      );
      return rows[0].id as string;
    });
    const createdAt = await value<Date>("select created_at from public.community_messages where id = $1", [id]);
    expect(Math.abs(createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("a member cannot edit, hide or delete another member's message", async () => {
    const { id } = await post(ole, "Oles besked");
    expect(await rowCountAs(jens, "update public.community_messages set body = 'Ændret' where id = $1", [id])).toBe(0);
    expect(await rowCountAs(jens, "update public.community_messages set deleted_at = now() where id = $1", [id])).toBe(0);
    expect(await rowCountAs(jens, "delete from public.community_messages where id = $1", [id])).toBe(0);
    expect(await value("select body from public.community_messages where id = $1", [id])).toBe("Oles besked");
  });

  it("an author edits his text (marked edited) but cannot hide it or change protected fields", async () => {
    const { id } = await post(jens, "Første udgave");
    await asUser(jens, (c) => c.query("update public.community_messages set body = 'Anden udgave' where id = $1", [id]));
    const [row] = await sql("select body, edited_at from public.community_messages where id = $1", [id]);
    expect(row.body).toBe("Anden udgave");
    expect(row.edited_at).toBeTruthy();
    await expectDenied(asUser(jens, (c) => c.query("update public.community_messages set hidden_at = now() where id = $1", [id])));
    await expectDenied(asUser(jens, (c) => c.query("update public.community_messages set is_system = true where id = $1", [id])));
    await expectDenied(asUser(jens, (c) => c.query("update public.community_messages set created_at = now() - interval '1 day' where id = $1", [id])));
  });

  it("soft-deleting his own message clears the text and image", async () => {
    const { id } = await post(jens, "Se mit billede", { image_path: `${jens}/billede.jpg` });
    await asUser(jens, (c) => c.query("update public.community_messages set deleted_at = now() where id = $1", [id]));
    const [row] = await sql("select body, image_path, deleted_at from public.community_messages where id = $1", [id]);
    expect(row.body).toBe("");
    expect(row.image_path).toBeNull();
    expect(row.deleted_at).toBeTruthy();
    // A deleted message cannot be revived or edited.
    await expectDenied(asUser(jens, (c) => c.query("update public.community_messages set body = 'Tilbage' where id = $1", [id])));
  });

  it("hidden messages are invisible to members but visible to admins", async () => {
    const { id } = await post(ole, "Upassende indhold");
    await expectDenied(asUser(jens, (c) => c.query("select public.moderate_community_message($1, true, 'x')", [id])), /Kun administratorer/);
    await asUser(admin, (c) => c.query("select public.moderate_community_message($1, true, 'Upassende')", [id]));
    expect((await feed(jens)).map((m) => m.id)).not.toContain(id);
    expect((await feed(ole)).map((m) => m.id)).not.toContain(id);
    expect((await feed(admin)).map((m) => m.id)).toContain(id);
    expect(await value("select count(*)::int from public.moderation_actions where target_id = $1 and action = 'hide_message'", [id])).toBe(1);
    await asUser(admin, (c) => c.query("select public.moderate_community_message($1, false)", [id]));
    expect((await feed(jens)).map((m) => m.id)).toContain(id);
  });

  it("image_path must be inside the author's own folder", async () => {
    await post(jens, "", { image_path: `${jens}/eget.jpg` });
    await expectRlsViolation(post(jens, "Lånt billede", { image_path: `${ole}/oles.jpg` }));
    await expectRlsViolation(post(jens, "Uden mappe", { image_path: "eget.jpg" }));
  });

  it("an empty message without an image is rejected", async () => {
    const error = await expectError(post(jens, "   "));
    expect(error.code).toBe("23514");
  });

  it("more than 20 messages within a minute triggers the rate limit", async () => {
    const fast = await createMember("fast", "Hurtig Skriver");
    for (let i = 1; i <= 20; i += 1) await post(fast, `Besked ${i}`);
    await expectDenied(post(fast, "Besked 21"), /meget hurtigt/);
    // Members cannot reset their own counter.
    expect(await rowCountAs(fast, "delete from public.rate_limits")).toBe(0);
    expect(await rowCountAs(fast, "update public.rate_limits set count = 0")).toBe(0);
  });

  it("the server posts the welcome message once per member, as a system message from the coach", async () => {
    await sql("update public.site_settings set coach_user_id = $1 where id = 1", [admin]);
    const newbie = await createMember("newbie", "Niels Nielsen");
    const first = await asService(async (c) => (await c.query("select public._post_community_welcome($1) as ok", [newbie])).rows[0].ok);
    const second = await asService(async (c) => (await c.query("select public._post_community_welcome($1) as ok", [newbie])).rows[0].ok);
    expect([first, second]).toEqual([true, false]);
    const welcome = await rowsAs(newbie, "select author_id, is_system, body from public.community_messages where is_system");
    expect(welcome).toHaveLength(1);
    expect(welcome[0].author_id).toBe(admin);
    expect(welcome[0].body).toContain("Niels");
    await expectDenied(asUser(newbie, (c) => c.query("select public._post_community_welcome($1)", [newbie])), /permission denied/);
  });

  it("unread community count and mark_community_read", async () => {
    const reader = await createMember("reader");
    await valueAs(reader, "select public.mark_community_read()");
    await post(ole, "Nyt i fællesskabet");
    const counts = await valueAs<{ community: number }>(reader, "select public.unread_counts()");
    expect(counts.community).toBe(1);
    await valueAs(reader, "select public.mark_community_read()");
    expect((await valueAs<{ community: number }>(reader, "select public.unread_counts()")).community).toBe(0);
    // Without community access the count is always 0.
    expect((await valueAs<{ community: number }>(outsider, "select public.unread_counts()")).community).toBe(0);
  });
});

// -----------------------------------------------------------------------------
describe("private messages", () => {
  let jens: string;
  let ole: string;
  let outsider: string;
  let conv: string;

  const start = (me: string, other: string) => valueAs<string>(me, "select public.get_or_create_direct_conversation($1)", [other]);
  const send = (me: string, conversation: string, body: string, extra = "") =>
    asUser(me, async (c) => {
      const { rows } = await c.query(
        `insert into public.private_messages (conversation_id, sender_id, body${extra ? ", created_at" : ""})
         values ($1, $2, $3${extra ? ", $4" : ""}) returning id`,
        extra ? [conversation, me, body, extra] : [conversation, me, body],
      );
      return rows[0].id as string;
    });
  const unread = (userId: string) => valueAs<{ messages: number; notifications: number }>(userId, "select public.unread_counts()");

  beforeAll(async () => {
    jens = await createMember("pm-jens", "Jens Hansen");
    ole = await createMember("pm-ole", "Ole Olsen");
    outsider = await createMember("pm-outsider", "Tredje Mand");
  });

  it("get_or_create_direct_conversation returns the same conversation both ways", async () => {
    conv = await start(jens, ole);
    expect(await start(ole, jens)).toBe(conv);
    expect(await start(jens, ole)).toBe(conv);
    const participants = await rowsAs(jens, "select user_id from public.conversation_participants where conversation_id = $1", [conv]);
    expect(participants.map((p) => p.user_id).sort()).toEqual([jens, ole].sort());
    await expectError(start(jens, jens), /anden person/);
  });

  it("a participant can send; the recipient is notified without the message text", async () => {
    await send(jens, conv, "Hemmelig besked om min skulder");
    expect(await rowsAs(ole, "select body from public.private_messages where conversation_id = $1", [conv])).toEqual([
      { body: "Hemmelig besked om min skulder" },
    ]);
    const notes = await rowsAs<{ title: string; body: string; link: string }>(ole, "select title, body, link from public.notifications where type = 'message'");
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("Ny besked");
    expect(notes[0].body).toContain("Jens Hansen");
    expect(notes[0].link).toBe(`/beskeder/${conv}`);
    expect(JSON.stringify(notes)).not.toMatch(/Hemmelig|skulder/);
    // The sender is not notified.
    expect(await rowsAs(jens, "select id from public.notifications where type = 'message'")).toEqual([]);
  });

  it("further unread messages update the same notification instead of adding more", async () => {
    await send(jens, conv, "Og en til");
    const notes = await rowsAs<{ body: string }>(ole, "select body from public.notifications where type = 'message' and read_at is null");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/nye beskeder/);
  });

  it("unread_counts, my_conversations and mark_conversation_read", async () => {
    expect(await unread(ole)).toMatchObject({ messages: 2, notifications: 1 });
    expect((await unread(jens)).messages).toBe(0);
    const list = await rowsAs(ole, "select * from public.my_conversations()");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ conversation_id: conv, other_user_id: jens, other_name: "Jens Hansen", unread_count: "2" });
    await expectDenied(asUser(outsider, (c) => c.query("select public.mark_conversation_read($1)", [conv])));
    await asUser(ole, (c) => c.query("select public.mark_conversation_read($1)", [conv]));
    expect(await unread(ole)).toMatchObject({ messages: 0, notifications: 0 });
  });

  it("an outsider cannot read the conversation, participants or messages, nor join or post", async () => {
    expect(await rowsAs(outsider, "select id from public.conversations where id = $1", [conv])).toEqual([]);
    expect(await rowsAs(outsider, "select user_id from public.conversation_participants where conversation_id = $1", [conv])).toEqual([]);
    expect(await rowsAs(outsider, "select id from public.private_messages where conversation_id = $1", [conv])).toEqual([]);
    expect(await rowsAs(outsider, "select * from public.my_conversations()")).toEqual([]);
    await expectRlsViolation(send(outsider, conv, "Må jeg være med?"));
    await expectRlsViolation(
      asUser(outsider, (c) => c.query("insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)", [conv, outsider])),
    );
    await expectRlsViolation(asUser(outsider, (c) => c.query("insert into public.conversations (direct_key) values ('x')")));
  });

  it("the administrator cannot read conversations he is not part of", async () => {
    expect(await rowsAs(admin, "select id from public.private_messages where conversation_id = $1", [conv])).toEqual([]);
  });

  it("a participant cannot send as the other person", async () => {
    await expectRlsViolation(
      asUser(jens, (c) => c.query("insert into public.private_messages (conversation_id, sender_id, body) values ($1, $2, 'x')", [conv, ole])),
    );
  });

  it("the sender can soft-delete (not edit) his own message; others cannot touch it", async () => {
    const id = await send(jens, conv, "Fortryder denne");
    await expectDenied(asUser(jens, (c) => c.query("update public.private_messages set body = 'Ændret' where id = $1", [id])));
    expect(await rowCountAs(ole, "update public.private_messages set deleted_at = now() where id = $1", [id])).toBe(0);
    await asUser(jens, (c) => c.query("update public.private_messages set deleted_at = now() where id = $1", [id]));
    expect(await value("select body from public.private_messages where id = $1", [id])).toBe("");
  });

  it("the server time is used for created_at (a future date cannot stay unread forever)", async () => {
    const id = await send(jens, conv, "Fra fremtiden", "2099-01-01");
    const createdAt = await value<Date>("select created_at from public.private_messages where id = $1", [id]);
    expect(Math.abs(createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    await asUser(ole, (c) => c.query("select public.mark_conversation_read($1)", [conv]));
    expect((await unread(ole)).messages).toBe(0);
  });

  it("a member without membership cannot start a conversation or write to one", async () => {
    const lapsed = await createUser(uniqueEmail("pm-none"), "Uden Medlemskab");
    await expectDenied(start(lapsed, jens), /aktivt medlemskab/);
    // Jens cannot start one with a non-member either (except the coach).
    await expectDenied(start(jens, lapsed), /kan ikke skrive/);
    // When a membership ends, the old conversation becomes read-only.
    const leaving = await createMember("pm-leaving");
    const old = await start(leaving, jens);
    await setSubscription(leaving, "canceled");
    await expectRlsViolation(send(leaving, old, "Hej igen"));
    await expectRlsViolation(send(jens, old, "Er du der?"));
  });

  it("a suspended member can message the coach but not other members", async () => {
    const s = await createMember("pm-suspended", "Suspenderet");
    const existing = await start(s, ole);
    await suspend(s);
    await expectDenied(start(s, jens), /kan ikke skrive/);
    await expectRlsViolation(send(s, existing, "Hej Ole"));
    const toCoach = await start(s, admin);
    await send(s, toCoach, "Hej træner, hvorfor er jeg suspenderet?");
    expect(await rowsAs(admin, "select body from public.private_messages where conversation_id = $1", [toCoach])).toHaveLength(1);
    await send(admin, toCoach, "Lad os tage en snak");
  });

  it("the admin can start a conversation with anyone", async () => {
    const lapsed = await createUser(uniqueEmail("pm-lapsed"), "Tidligere Medlem");
    const id = await start(admin, lapsed);
    await send(admin, id, "Vil du være med igen?");
    expect(await rowsAs(lapsed, "select body from public.private_messages where conversation_id = $1", [id])).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
describe("reports", () => {
  let jens: string;
  let ole: string;
  let outsider: string;
  let messageId: string;
  let privateId: string;

  const report = (userId: string, type: string, target: string, reason = "Upassende") =>
    valueAs<string>(userId, "select public.report_content($1, $2, $3)", [type, target, reason]);

  beforeAll(async () => {
    jens = await createMember("rep-jens", "Jens Hansen");
    ole = await createMember("rep-ole", "Ole Olsen");
    outsider = await createMember("rep-outsider");
    messageId = (await post(ole, "Grim kommentar i fællesskabet")).id;
    const conv = await valueAs<string>(jens, "select public.get_or_create_direct_conversation($1)", [ole]);
    privateId = await asUser(ole, async (c) => {
      const { rows } = await c.query(
        "insert into public.private_messages (conversation_id, sender_id, body) values ($1, $2, 'Grim privat besked') returning id",
        [conv, ole],
      );
      return rows[0].id as string;
    });
  });

  it("report_content stores a snapshot and notifies the admin without the content", async () => {
    const id = await report(jens, "community_message", messageId);
    const [row] = await sql("select reporter_id, target_user_id, snapshot, status from public.reports where id = $1", [id]);
    expect(row).toEqual({ reporter_id: jens, target_user_id: ole, snapshot: "Grim kommentar i fællesskabet", status: "open" });
    const notes = await sql("select title, body from public.notifications where user_id = $1 and type = 'report'", [admin]);
    expect(notes.length).toBeGreaterThan(0);
    expect(JSON.stringify(notes)).not.toMatch(/Grim/);
  });

  it("a private message can only be reported by a participant", async () => {
    const id = await report(jens, "private_message", privateId);
    expect(await value("select snapshot from public.reports where id = $1", [id])).toBe("Grim privat besked");
    await expectError(report(outsider, "private_message", privateId), /ikke fundet/);
    expect(await value("select count(*)::int from public.reports where reporter_id = $1", [outsider])).toBe(0);
  });

  it("a reason is required", async () => {
    await expectError(report(jens, "profile", ole, "   "), /hvorfor/);
  });

  it("admins read all reports; members cannot read reports, not even their own", async () => {
    await report(outsider, "profile", ole, "Falsk profil");
    const all = await rowsAs(admin, "select reporter_id from public.reports");
    expect(new Set(all.map((r) => r.reporter_id))).toEqual(new Set([jens, outsider]));
    expect(await rowsAs(outsider, "select reporter_id, snapshot from public.reports")).toEqual([]);
    expect(await rowsAs(ole, "select id from public.reports")).toEqual([]);
  });

  it("members cannot insert or resolve reports directly; the admin resolves through resolve_report", async () => {
    await expectRlsViolation(
      asUser(jens, (c) =>
        c.query("insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'profile', $2, 'x')", [jens, ole]),
      ),
    );
    const id = await report(jens, "profile", ole, "Igen");
    expect(await rowCountAs(jens, "update public.reports set status = 'dismissed' where id = $1", [id])).toBe(0);
    await expectDenied(asUser(jens, (c) => c.query("select public.resolve_report($1, 'dismissed')", [id])), /Kun administratorer/);
    await asUser(admin, (c) => c.query("select public.resolve_report($1, 'resolved', 'Talt med medlemmet')", [id]));
    const [row] = await sql("select status, resolved_by from public.reports where id = $1", [id]);
    expect(row).toEqual({ status: "resolved", resolved_by: admin });
  });
});
