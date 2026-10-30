import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createAdmin,
  createMember,
  createUser,
  daysFromNow,
  expectDenied,
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

let admin: string;
let secondAdmin: string;
let active: string;
let canceling: string;
let grace: string;
let lapsed: string;
let none: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin("coach", "Træneren");
  secondAdmin = await createAdmin("assistent", "Assistent");
  active = await createMember("active", "Aktiv Andersen");
  canceling = await createUser(uniqueEmail("canceling"), "Opsagt Olsen");
  await setSubscription(canceling, "active", { cancel_at_period_end: true, current_period_end: daysFromNow(5) });
  grace = await createUser(uniqueEmail("grace"), "Grace Gregersen");
  await setSubscription(grace, "past_due", { payment_failed_at: daysFromNow(-2) });
  lapsed = await createUser(uniqueEmail("lapsed"), "Udløbet Ulriksen");
  await setSubscription(lapsed, "canceled");
  none = await createUser(uniqueEmail("none"), "Ingen Nielsen");
});
afterAll(teardownDatabase);

async function createAnnouncement(fields: { title: string; status?: string; published_at?: Date | null; is_important?: boolean }) {
  return value<string>(
    "insert into public.announcements (author_id, title, body, status, published_at, is_important) values ($1, $2, 'Tekst', $3, $4, $5) returning id",
    [admin, fields.title, fields.status ?? "draft", fields.published_at ?? null, fields.is_important ?? false],
  );
}
const publish = (id: string, as = admin) => valueAs<number>(as, "select public.publish_announcement($1)", [id]);
const visible = (userId: string, id: string) => rowsAs(userId, "select id from public.announcements where id = $1", [id]).then((r) => r.length === 1);
const notifiedUsers = async (id: string) =>
  (await sql<{ user_id: string }>("select user_id from public.notifications where type = 'announcement' and data ->> 'announcement_id' = $1", [id])).map(
    (r) => r.user_id,
  );

// -----------------------------------------------------------------------------
describe("announcements", () => {
  it("members cannot insert, update or delete announcements", async () => {
    await expectRlsViolation(
      asUser(active, (c) => c.query("insert into public.announcements (title, status, published_at) values ('Mit opslag', 'published', now())")),
    );
    const id = await createAnnouncement({ title: "Fra Christian", status: "published", published_at: daysFromNow(-1) });
    expect(await rowCountAs(active, "update public.announcements set title = 'Ændret' where id = $1", [id])).toBe(0);
    expect(await rowCountAs(active, "delete from public.announcements where id = $1", [id])).toBe(0);
    expect(await value("select title from public.announcements where id = $1", [id])).toBe("Fra Christian");
  });

  it("members cannot read drafts or announcements scheduled for later", async () => {
    const draft = await createAnnouncement({ title: "Kladde" });
    const future = await createAnnouncement({ title: "I morgen", status: "published", published_at: daysFromNow(1) });
    expect(await visible(active, draft)).toBe(false);
    expect(await visible(active, future)).toBe(false);
    expect(await visible(admin, draft)).toBe(true);
    expect(await visible(admin, future)).toBe(true);
  });

  it("published announcements are visible to entitled members only", async () => {
    const id = await createAnnouncement({ title: "Velkommen", status: "published", published_at: daysFromNow(-1) });
    expect(await visible(active, id)).toBe(true);
    expect(await visible(canceling, id)).toBe(true);
    expect(await visible(grace, id)).toBe(true);
    expect(await visible(lapsed, id)).toBe(false);
    expect(await visible(none, id)).toBe(false);
  });

  it("a member calling publish_announcement is denied", async () => {
    const id = await createAnnouncement({ title: "Kladde" });
    await expectDenied(publish(id, active), /Kun administratorer/);
    expect(await value("select status from public.announcements where id = $1", [id])).toBe("draft");
  });

  it("publishing an ordinary announcement makes it visible but notifies no one", async () => {
    const id = await createAnnouncement({ title: "Almindeligt opslag" });
    expect(await publish(id)).toBe(0);
    expect(await visible(active, id)).toBe(true);
    expect(await notifiedUsers(id)).toEqual([]);
  });

  it("publishing an important announcement notifies entitled non-admin members only, once", async () => {
    const id = await createAnnouncement({ title: "Vigtigt: Ny træningsdag", is_important: true });
    const count = await publish(id);
    const users = await notifiedUsers(id);
    expect(count).toBe(users.length);
    expect(new Set(users)).toEqual(new Set([active, canceling, grace]));
    expect(users).not.toContain(admin);
    expect(users).not.toContain(secondAdmin);
    const [note] = await rowsAs(active, "select title, body, link from public.notifications where type = 'announcement'");
    expect(note).toEqual({ title: "Nyt opslag fra Christian", body: "Vigtigt: Ny træningsdag", link: `/opslag/${id}` });
    // Publishing again does not notify twice.
    expect(await publish(id)).toBe(0);
    expect((await notifiedUsers(id)).length).toBe(users.length);
  });

  it("an important announcement scheduled for later is not announced early", async () => {
    const id = await createAnnouncement({ title: "Senere", is_important: true, published_at: daysFromNow(2) });
    expect(await publish(id)).toBe(0);
    expect(await notifiedUsers(id)).toEqual([]);
    expect(await visible(active, id)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe("notifications", () => {
  let mine: string;
  let theirs: string;

  beforeAll(async () => {
    mine = await value<string>(
      "insert into public.notifications (user_id, type, title, body, link) values ($1, 'system', 'Til dig', 'Tekst', '/hjem') returning id",
      [active],
    );
    theirs = await value<string>(
      "insert into public.notifications (user_id, type, title) values ($1, 'system', 'Til en anden') returning id",
      [canceling],
    );
  });

  it("users see only their own notifications", async () => {
    const ids = (await rowsAs(active, "select id from public.notifications")).map((r) => r.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  it("users can mark their own as read, not other people's", async () => {
    expect(await rowCountAs(active, "update public.notifications set read_at = now() where id = $1", [mine])).toBe(1);
    expect(await rowCountAs(active, "update public.notifications set read_at = now() where id = $1", [theirs])).toBe(0);
    expect(await value("select read_at from public.notifications where id = $1", [theirs])).toBeNull();
  });

  it("mark_notifications_read only touches the caller's unread notifications", async () => {
    await sql("insert into public.notifications (user_id, type, title) values ($1, 'system', 'A'), ($1, 'system', 'B')", [active]);
    const marked = await valueAs<number>(active, "select public.mark_notifications_read()");
    expect(marked).toBeGreaterThanOrEqual(2);
    expect(await valueAs<number>(active, "select count(*)::int from public.notifications where read_at is null")).toBe(0);
    expect(await value("select read_at from public.notifications where id = $1", [theirs])).toBeNull();
  });

  it("users cannot change title, body, link or recipient", async () => {
    await expectDenied(asUser(active, (c) => c.query("update public.notifications set title = 'Phishing' where id = $1", [mine])), /markere/);
    await expectDenied(asUser(active, (c) => c.query("update public.notifications set body = 'Klik her' where id = $1", [mine])));
    await expectDenied(asUser(active, (c) => c.query("update public.notifications set link = '/admin' where id = $1", [mine])));
    // Refused by the guard trigger (and the policy's WITH CHECK behind it).
    await expectDenied(asUser(active, (c) => c.query("update public.notifications set user_id = $2 where id = $1", [mine, canceling])));
    expect(await value("select user_id from public.notifications where id = $1", [mine])).toBe(active);
  });

  it("users cannot create notifications (for themselves or others)", async () => {
    await expectRlsViolation(
      asUser(active, (c) => c.query("insert into public.notifications (user_id, type, title) values ($1, 'system', 'Falsk')", [canceling])),
    );
    await expectRlsViolation(
      asUser(active, (c) => c.query("insert into public.notifications (user_id, type, title) values ($1, 'system', 'Falsk')", [active])),
    );
  });

  it("users can delete their own notifications only", async () => {
    expect(await rowCountAs(active, "delete from public.notifications where id = $1", [theirs])).toBe(0);
    expect(await rowCountAs(active, "delete from public.notifications where id = $1", [mine])).toBe(1);
  });
});
