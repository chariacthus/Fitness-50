import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Client,
  asService,
  asUser,
  createAdmin,
  createMember,
  createUser,
  daysFromNow,
  expectDenied,
  expectError,
  repoFile,
  rowsAs,
  setSubscription,
  setupDatabase,
  sql,
  startDatabaseFrom,
  teardownDatabase,
  uniqueEmail,
  value,
  valueAs,
} from "./helpers";

// Fixes from the independent review (migration 20261030000060_review_fixes,
// also shipped as supabase/patches/2026-10-31-review-fixes.sql). Every block
// proves the hole is closed AND that the legitimate use still works.

const MIGRATION = "supabase/migrations/20261030000060_review_fixes.sql";
const PATCH = "supabase/patches/2026-10-31-review-fixes.sql";

let admin: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin("coach", "Træneren");
});
afterAll(teardownDatabase);

const count = (text: string, params: unknown[] = []) => value<number>(`select count(*)::int from (${text}) x`, params);
const adminNotifications = (type: string, extra = "", params: unknown[] = []) =>
  count(`select 1 from public.notifications where user_id = '${admin}' and type = '${type}' ${extra}`, params);

// -----------------------------------------------------------------------------
describe("1. Stripe test/live separation", () => {
  const state = (userId: string) => value<string>("select public._membership_state($1)", [userId]);
  const hasAddon = (userId: string) => value<boolean>("select public._has_addon($1, 'kostplan')", [userId]);
  const setLivemode = (subscriptionId: string, live: boolean | null) =>
    sql("update public.subscriptions set livemode = $2 where id = $1", [subscriptionId, live]);

  async function withStripeMode<T>(live: boolean | null, fn: () => Promise<T>) {
    await sql("update public.admin_settings set stripe_livemode = $1 where id = 1", [live]);
    try {
      return await fn();
    } finally {
      await sql("update public.admin_settings set stripe_livemode = null where id = 1");
    }
  }

  async function buyAddon(userId: string, live: boolean | null, status = "paid") {
    await sql(
      `insert into public.purchases (user_id, product_id, provider, status, livemode)
       values ($1, (select id from public.products where slug = 'kostplan'), 'stripe', $2, $3)`,
      [userId, status, live],
    );
  }

  it("the new columns are nullable (null = unknown)", async () => {
    const rows = await sql<{ table_name: string; column_name: string; is_nullable: string; data_type: string }>(
      `select table_name, column_name, is_nullable, data_type from information_schema.columns
        where table_schema = 'public'
          and ((table_name in ('subscriptions', 'purchases') and column_name = 'livemode')
               or (table_name = 'admin_settings' and column_name = 'stripe_livemode'))
        order by table_name`,
    );
    expect(rows).toEqual([
      { table_name: "admin_settings", column_name: "stripe_livemode", is_nullable: "YES", data_type: "boolean" },
      { table_name: "purchases", column_name: "livemode", is_nullable: "YES", data_type: "boolean" },
      { table_name: "subscriptions", column_name: "livemode", is_nullable: "YES", data_type: "boolean" },
    ]);
  });

  it("a test-mode subscription gives no access once the site runs live", async () => {
    const tester = await createUser(uniqueEmail("testkort"), "Test Tester");
    await setLivemode(await setSubscription(tester, "active"), false);
    // Mode unknown: nothing is filtered (existing databases keep working).
    expect(await state(tester)).toBe("active");
    await withStripeMode(true, async () => {
      expect(await state(tester)).toBe("none");
      expect(await valueAs(tester, "select public.is_entitled()")).toBe(false);
      expect(await valueAs(tester, "select public.membership_state()")).toBe("none");
      const summary = await valueAs<Record<string, unknown>>(tester, "select public.membership_summary()");
      expect(summary).toEqual({ state: "none" });
      expect(await rowsAs(tester, "select id from public.community_messages")).toEqual([]);
    });
    // Still the right access while the site runs on test keys.
    await withStripeMode(false, async () => {
      expect(await state(tester)).toBe("active");
    });
  });

  it("live and unknown-mode subscriptions keep working in live mode", async () => {
    const live = await createUser(uniqueEmail("live"), "Live Larsen");
    await setLivemode(await setSubscription(live, "active", { amount: 9900 }), true);
    const old = await createUser(uniqueEmail("gammel"), "Gammel Gregersen");
    await setSubscription(old, "active"); // livemode null: stored before the column existed
    await withStripeMode(true, async () => {
      expect(await state(live)).toBe("active");
      expect(await state(old)).toBe("active");
      const summary = await valueAs<Record<string, unknown>>(live, "select public.membership_summary()");
      expect(summary).toMatchObject({ state: "active", status: "active", amount: 9900 });
    });
  });

  it("the summary and the state pick the same (live) subscription when both modes exist", async () => {
    const both = await createUser(uniqueEmail("begge"), "Begge Bertelsen");
    await setLivemode(await setSubscription(both, "canceled", { ref: "live", created_at: daysFromNow(-1) }), true);
    await setLivemode(await setSubscription(both, "active", { ref: "test", amount: 100 }), false);
    await withStripeMode(true, async () => {
      expect(await state(both)).toBe("expired");
      const summary = await valueAs<Record<string, unknown>>(both, "select public.membership_summary()");
      expect(summary).toMatchObject({ state: "expired", status: "canceled" });
    });
  });

  it("a test-mode add-on purchase gives no access in live mode; manual grants always do", async () => {
    const tester = await createMember("addon-test");
    await buyAddon(tester, false);
    const granted = await createMember("addon-granted");
    await asUser(admin, (c) => c.query("select public.grant_addon($1, 'kostplan')", [granted]));
    const live = await createMember("addon-live");
    await buyAddon(live, true);

    expect(await hasAddon(tester)).toBe(true);
    await withStripeMode(true, async () => {
      expect(await hasAddon(tester)).toBe(false);
      expect(await valueAs(tester, "select public.has_addon('kostplan')")).toBe(false);
      expect(await hasAddon(granted)).toBe(true);
      expect(await hasAddon(live)).toBe(true);
    });
    await withStripeMode(false, async () => {
      expect(await hasAddon(tester)).toBe(true);
      expect(await hasAddon(live)).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
describe("2. access end of a cancelling subscription", () => {
  const state = (userId: string) => value<string>("select public._membership_state($1)", [userId]);
  const summary = (userId: string) => valueAs<Record<string, unknown>>(userId, "select public.membership_summary()");
  const sameTime = (a: unknown, b: Date) => Math.abs(new Date(a as string).getTime() - b.getTime()) < 1000;

  it("a custom cancel date after the current period keeps access across renewals", async () => {
    const id = await createUser(uniqueEmail("senere"), "Senere Sørensen");
    const cancelAt = daysFromNow(40);
    // The renewal time has passed, the webhook for the new period has not arrived yet.
    await setSubscription(id, "active", { cancel_at: cancelAt, current_period_end: daysFromNow(-1) });
    expect(await state(id)).toBe("canceling");
    const s = await summary(id);
    expect(s.state).toBe("canceling");
    expect(sameTime(s.access_until, cancelAt)).toBe(true);
  });

  it("an earlier cancel_at still ends access before the period end", async () => {
    const id = await createUser(uniqueEmail("tidligere"), "Tidlig Thomsen");
    await setSubscription(id, "active", { cancel_at: daysFromNow(-1), current_period_end: daysFromNow(10) });
    expect(await state(id)).toBe("expired");
    const later = await createUser(uniqueEmail("tidligere2"), "Tidlig Toft");
    const cancelAt = daysFromNow(3);
    await setSubscription(later, "active", { cancel_at: cancelAt, current_period_end: daysFromNow(10) });
    expect(sameTime((await summary(later)).access_until, cancelAt)).toBe(true);
  });

  it("cancel at period end without cancel_at uses the period end", async () => {
    const id = await createUser(uniqueEmail("periode"), "Periode Petersen");
    const periodEnd = daysFromNow(12);
    await setSubscription(id, "active", { cancel_at_period_end: true, current_period_end: periodEnd });
    const s = await summary(id);
    expect(s.state).toBe("canceling");
    expect(sameTime(s.access_until, periodEnd)).toBe(true);
    const past = await createUser(uniqueEmail("periode2"), "Periode Poulsen");
    await setSubscription(past, "active", { cancel_at_period_end: true, current_period_end: daysFromNow(-1) });
    expect(await state(past)).toBe("expired");
  });
});

// -----------------------------------------------------------------------------
describe("3 + 4 + 10. profile visibility, profile reports and report access", () => {
  let jens: string;
  let ole: string;
  let neverPaid: string;
  let exAuthor: string;
  let exHidden: string;
  let exPartner: string;
  let exStranger: string;
  let suspended: string;

  const visibleIds = async (userId: string) =>
    new Set((await rowsAs<{ id: string }>(userId, "select id from public.profiles")).map((r) => r.id));
  const report = (userId: string, target: string, reason = "Upassende profil") =>
    valueAs<string>(userId, "select public.report_content('profile', $1, $2)", [target, reason]);

  beforeAll(async () => {
    jens = await createMember("vis-jens", "Jens Hansen");
    ole = await createMember("vis-ole", "Ole Olsen");
    neverPaid = await createUser(uniqueEmail("vis-aldrig"), "Aldrig Betalt");
    await sql("update public.profiles set bio = 'Hemmelig bio' where id = $1", [neverPaid]);

    exAuthor = await createUser(uniqueEmail("vis-forfatter"), "Tidligere Forfatter");
    await setSubscription(exAuthor, "canceled");
    await sql("insert into public.community_messages (author_id, body) values ($1, 'Hej fra mig')", [exAuthor]);

    exHidden = await createUser(uniqueEmail("vis-skjult"), "Skjult Forfatter");
    await setSubscription(exHidden, "canceled");
    await sql("insert into public.community_messages (author_id, body, hidden_at) values ($1, 'Grimt indlæg', now())", [exHidden]);

    exPartner = await createMember("vis-partner", "Tidligere Partner");
    await valueAs(jens, "select public.get_or_create_direct_conversation($1)", [exPartner]);
    await setSubscription(exPartner, "canceled");

    exStranger = await createUser(uniqueEmail("vis-fremmed"), "Fremmed Frederiksen");
    await setSubscription(exStranger, "canceled");

    suspended = await createMember("vis-suspenderet", "Suspenderet Sven");
    await asUser(admin, (c) => c.query("select public.set_community_suspension($1, true)", [suspended]));
  });

  it("an entitled member sees himself, the coach, fellow members, message authors and conversation partners", async () => {
    const seen = await visibleIds(jens);
    for (const id of [jens, admin, ole, exAuthor, exPartner, suspended]) expect(seen.has(id)).toBe(true);
  });

  it("an entitled member does not see never-paid sign-ups or ex-members he has no reason to see", async () => {
    const seen = await visibleIds(jens);
    for (const id of [neverPaid, exHidden, exStranger]) expect(seen.has(id)).toBe(false);
    // Conversation partners are only visible to the people in the conversation.
    expect((await visibleIds(ole)).has(exPartner)).toBe(false);
    expect(await valueAs(jens, "select public.can_see_profile($1)", [neverPaid])).toBe(false);
    expect(await valueAs(jens, "select public.can_see_profile($1)", [exPartner])).toBe(true);
    expect(await valueAs(jens, "select public.can_see_profile(null)")).toBe(false);
  });

  it("someone without a membership sees only himself and the coach", async () => {
    expect(await visibleIds(neverPaid)).toEqual(new Set([neverPaid, admin]));
    expect(await visibleIds(exPartner)).toEqual(new Set([exPartner, admin]));
  });

  it("the administrator sees every profile", async () => {
    const all = await value<number>("select count(*)::int from public.profiles");
    expect((await visibleIds(admin)).size).toBe(all);
  });

  it("a profile the reporter cannot see is 'not found': no report, no admin notification", async () => {
    const before = await adminNotifications("report");
    await expectError(report(neverPaid, ole), /Indholdet blev ikke fundet/);
    await expectError(report(exStranger, ole), /Indholdet blev ikke fundet/);
    await expectError(report(jens, neverPaid), /Indholdet blev ikke fundet/);
    expect(await count("select 1 from public.reports where reporter_id = any($1)", [[neverPaid, exStranger]])).toBe(0);
    expect(await count("select 1 from public.reports where target_id = $1", [neverPaid])).toBe(0);
    expect(await adminNotifications("report")).toBe(before);
  });

  it("visible profiles can still be reported, with a snapshot for the administrator", async () => {
    const before = await adminNotifications("report");
    const id = await report(jens, ole);
    expect(await value("select snapshot from public.reports where id = $1", [id])).toBe("Ole Olsen");
    await report(jens, exAuthor);
    await report(neverPaid, admin, "Test af coach-profil");
    expect(await adminNotifications("report")).toBe(before + 3);
  });

  it("reports are readable by administrators only, not by the reporter or the reported member", async () => {
    const id = await report(ole, jens, "Spam");
    await asUser(admin, (c) => c.query("select public.resolve_report($1, 'resolved', 'Intern note om Jens')", [id]));
    expect(await rowsAs(ole, "select id, snapshot, resolution_note from public.reports")).toEqual([]);
    expect(await rowsAs(jens, "select id from public.reports")).toEqual([]);
    const [row] = await rowsAs(admin, "select snapshot, resolution_note from public.reports where id = $1", [id]);
    expect(row).toEqual({ snapshot: "Jens Hansen", resolution_note: "Intern note om Jens" });
  });
});

// -----------------------------------------------------------------------------
describe("5. community images", () => {
  let jens: string;
  let ole: string;
  let outsider: string;
  let suspended: string;
  const path = () => `${jens}/billede.jpg`;

  const canSee = async (userId: string, name: string) =>
    (await rowsAs(userId, "select 1 from storage.objects where bucket_id = 'community' and name = $1", [name])).length === 1;
  const moderate = (messageId: string, hide: boolean) =>
    asUser(admin, (c) => c.query("select public.moderate_community_message($1, $2, 'Upassende')", [messageId, hide]));

  beforeAll(async () => {
    jens = await createMember("billed-jens", "Jens Hansen");
    ole = await createMember("billed-ole", "Ole Olsen");
    outsider = await createUser(uniqueEmail("billed-outsider"), "Uden Medlemskab");
    suspended = await createMember("billed-suspenderet");
    await asUser(admin, (c) => c.query("select public.set_community_suspension($1, true)", [suspended]));
  });

  it("an uploaded image that is not posted is visible to the uploader and admins only", async () => {
    await asUser(jens, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('community', $1, $2)", [path(), jens]));
    expect(await canSee(jens, path())).toBe(true);
    expect(await canSee(admin, path())).toBe(true);
    expect(await canSee(ole, path())).toBe(false);
    expect(await rowsAs(ole, "select name from storage.objects where bucket_id = 'community'")).toEqual([]);
  });

  it("the image of a visible message is readable by community members only", async () => {
    const messageId = await valueAs<string>(
      jens,
      "insert into public.community_messages (author_id, body, image_path) values ($1, 'Se her', $2) returning id",
      [jens, path()],
    );
    expect(await canSee(ole, path())).toBe(true);
    expect(await canSee(outsider, path())).toBe(false);
    expect(await canSee(suspended, path())).toBe(false);

    // Hidden by a moderator: other members lose access, the file is kept.
    await moderate(messageId, true);
    expect(await canSee(ole, path())).toBe(false);
    expect(await canSee(jens, path())).toBe(true);
    expect(await canSee(admin, path())).toBe(true);
    await moderate(messageId, false);
    expect(await canSee(ole, path())).toBe(true);

    // Deleted by the author.
    await asUser(jens, (c) => c.query("update public.community_messages set deleted_at = now() where id = $1", [messageId]));
    expect(await canSee(ole, path())).toBe(false);
  });

  it("an image still referenced by a deleted message is not readable", async () => {
    const name = `${jens}/slettet.jpg`;
    await sql("insert into storage.objects (bucket_id, name) values ('community', $1)", [name]);
    await sql("insert into public.community_messages (author_id, body, image_path, deleted_at) values ($1, '', $2, now())", [jens, name]);
    expect(await canSee(ole, name)).toBe(false);
    expect(await canSee(jens, name)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe("6. announcement media", () => {
  let member: string;
  let outsider: string;
  let announcement: string;
  let mediaId: string;
  const objectName = () => `${announcement}/video.mp4`;

  const mediaVisible = async (userId: string, id: string) =>
    (await rowsAs(userId, "select id from public.media where id = $1", [id])).length === 1;
  const fileVisible = async (userId: string, bucket: string, name: string) =>
    (await rowsAs(userId, "select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).length === 1;

  async function addMedia(bucket: string, name: string, title: string) {
    await sql("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
    return value<string>(
      "insert into public.media (owner_id, bucket, path, kind, mime_type, title) values ($1, $2, $3, 'video', 'video/mp4', $4) returning id",
      [admin, bucket, name, title],
    );
  }

  beforeAll(async () => {
    member = await createMember("medie", "Jens Hansen");
    outsider = await createUser(uniqueEmail("medie-outsider"), "Uden Medlemskab");
    announcement = await value<string>("insert into public.announcements (author_id, title) values ($1, 'Kommer snart') returning id", [admin]);
    mediaId = await addMedia("announcements", objectName(), "Hemmelig video");
    await sql("insert into public.announcement_media (announcement_id, media_id) values ($1, $2)", [announcement, mediaId]);
  });

  it("media of a draft announcement is hidden from members (row and file)", async () => {
    expect(await mediaVisible(member, mediaId)).toBe(false);
    expect(await fileVisible(member, "announcements", objectName())).toBe(false);
    expect(await rowsAs(member, "select path, title from public.media where bucket = 'announcements'")).toEqual([]);
    expect(await mediaVisible(admin, mediaId)).toBe(true);
    expect(await fileVisible(admin, "announcements", objectName())).toBe(true);
  });

  it("media of an announcement scheduled for later is hidden until the publish time", async () => {
    await sql("update public.announcements set status = 'published', published_at = $2 where id = $1", [announcement, daysFromNow(2)]);
    expect(await mediaVisible(member, mediaId)).toBe(false);
    expect(await fileVisible(member, "announcements", objectName())).toBe(false);
  });

  it("media of a published announcement is readable by entitled members", async () => {
    await sql("update public.announcements set published_at = $2 where id = $1", [announcement, daysFromNow(-1)]);
    expect(await mediaVisible(member, mediaId)).toBe(true);
    expect(await fileVisible(member, "announcements", objectName())).toBe(true);
    expect(await mediaVisible(outsider, mediaId)).toBe(false);
    expect(await fileVisible(outsider, "announcements", objectName())).toBe(false);
  });

  it("an announcement file that is not attached to anything is hidden from members", async () => {
    const loose = await addMedia("announcements", "loes/fil.mp4", "Løs fil");
    expect(await mediaVisible(member, loose)).toBe(false);
    expect(await fileVisible(member, "announcements", "loes/fil.mp4")).toBe(false);
    expect(await fileVisible(admin, "announcements", "loes/fil.mp4")).toBe(true);
  });

  it("training media stays readable by entitled members", async () => {
    const training = await addMedia("training-media", "oevelser/squat.mp4", "Squat");
    expect(await mediaVisible(member, training)).toBe(true);
    expect(await fileVisible(member, "training-media", "oevelser/squat.mp4")).toBe(true);
    expect(await mediaVisible(outsider, training)).toBe(false);
    expect(await fileVisible(outsider, "training-media", "oevelser/squat.mp4")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe("7 + 9. onboarding", () => {
  const row = (userId: string) =>
    sql<{ status: string; submitted_at: Date | null; health_consent_at: Date | null; answers: Record<string, unknown>; health_info: string | null }>(
      "select status, submitted_at, health_consent_at, answers, health_info from public.onboarding_submissions where user_id = $1",
      [userId],
    ).then((r) => r[0]);
  const memberNotifications = (userId: string) => adminNotifications("onboarding", "and data ->> 'user_id' = $1", [userId]);
  const save = (userId: string, set: string, params: unknown[] = []) =>
    asUser(userId, (c) => c.query(`update public.onboarding_submissions set ${set} where user_id = $1`, [userId, ...params]));
  const recent = (d: Date | null) => d !== null && Math.abs(d.getTime() - Date.now()) < 60_000;

  it("timestamps sent by the member on insert are ignored", async () => {
    const m = await createMember("onb-tid");
    await asUser(m, (c) =>
      c.query(
        `insert into public.onboarding_submissions (user_id, status, health_info, health_consent, submitted_at, health_consent_at)
         values ($1, 'draft', 'Ondt i knæet', true, '2000-01-01', '2000-01-01')`,
        [m],
      ),
    );
    const r = await row(m);
    expect(r.submitted_at).toBeNull();
    expect(recent(r.health_consent_at)).toBe(true);
    expect(r.health_info).toBe("Ondt i knæet");
  });

  it("a member cannot forge or clear submitted_at / health_consent_at, and forging does not notify", async () => {
    const m = await createMember("onb-falsk");
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, status, health_info, health_consent) values ($1, 'submitted', 'Ryg', true)", [m]),
    );
    const before = await row(m);
    expect(recent(before.submitted_at)).toBe(true);
    expect(recent(before.health_consent_at)).toBe(true);
    const notes = await memberNotifications(m);
    expect(notes).toBe(1);

    await save(m, "submitted_at = now() + interval '1 day', health_consent_at = null");
    await save(m, "health_consent_at = '2000-01-01'");
    const after = await row(m);
    expect(after.submitted_at).toEqual(before.submitted_at);
    expect(after.health_consent_at).toEqual(before.health_consent_at);
    expect(await memberNotifications(m)).toBe(notes);
  });

  it("saving and submitting still work and notify the administrator once", async () => {
    const m = await createMember("onb-normal", "Poul Sørensen");
    await asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id, answers, current_step) values ($1, '{}', 1)", [m]));
    await save(m, "current_step = 3, answers = $2", [{ goals: ["styrke"] }]);
    expect(await memberNotifications(m)).toBe(0);
    await save(m, "status = 'submitted'");
    const r = await row(m);
    expect(r.status).toBe("submitted");
    expect(recent(r.submitted_at)).toBe(true);
    expect(await memberNotifications(m)).toBe(1);
    // The administrator can still review it.
    await asUser(admin, (c) =>
      c.query("update public.onboarding_submissions set status = 'reviewed', reviewed_by = $2, reviewed_at = now() where user_id = $1", [m, admin]),
    );
    expect((await row(m)).status).toBe("reviewed");
  });

  it("toggling the status notifies at most 3 times per 24 hours, and every save still succeeds", async () => {
    const m = await createMember("onb-spam");
    await asUser(m, (c) => c.query("insert into public.onboarding_submissions (user_id) values ($1)", [m]));
    let lastSubmitted: Date | null = null;
    for (let i = 0; i < 5; i += 1) {
      await save(m, "status = 'submitted'");
      const r = await row(m);
      expect(r.status).toBe("submitted");
      expect(r.submitted_at).not.toEqual(lastSubmitted);
      lastSubmitted = r.submitted_at;
      await save(m, "status = 'draft'");
    }
    expect(await memberNotifications(m)).toBe(3);
  });

  it("without consent the answer 'ja' to has_limitations is reset, also when consent is withdrawn", async () => {
    const m = await createMember("onb-ja");
    await asUser(m, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, answers, health_consent) values ($1, $2, false)", [
        m,
        { has_limitations: "ja", goals: ["styrke"] },
      ]),
    );
    expect((await row(m)).answers).toEqual({ has_limitations: "vil_ikke_oplyse", goals: ["styrke"] });

    // With consent "ja" is kept …
    await save(m, "answers = $2, health_info = 'Ondt i skulderen', health_consent = true", [{ has_limitations: "ja", goals: ["styrke"] }]);
    expect((await row(m)).answers).toEqual({ has_limitations: "ja", goals: ["styrke"] });
    // … and removed together with the health information when consent is withdrawn.
    expect(await valueAs(m, "select public.withdraw_health_consent()")).toBe(true);
    const r = await row(m);
    expect(r.answers).toEqual({ has_limitations: "vil_ikke_oplyse", goals: ["styrke"] });
    expect(r.health_info).toBeNull();
    expect(r.health_consent_at).toBeNull();

    // Other answers are left alone.
    const nej = await createMember("onb-nej");
    await asUser(nej, (c) =>
      c.query("insert into public.onboarding_submissions (user_id, answers) values ($1, $2)", [nej, { has_limitations: "nej" }]),
    );
    expect((await row(nej)).answers).toEqual({ has_limitations: "nej" });
  });
});

// -----------------------------------------------------------------------------
describe("8 + 11. data requests", () => {
  const insert = (userId: string, type: "deletion" | "export") =>
    valueAs<string>(userId, "insert into public.data_requests (user_id, type) values ($1, $2) returning id", [userId, type]);
  const cancel = (userId: string, id: string) =>
    asUser(userId, (c) => c.query("update public.data_requests set status = 'canceled' where id = $1", [id]));
  const requestNotifications = (userId: string) =>
    adminNotifications("data_request", "and data ->> 'request_id' in (select id::text from public.data_requests where user_id = $1)", [userId]);

  it("a member's first request works and notifies the administrator", async () => {
    const m = await createUser(uniqueEmail("data-foerste"), "Første Frandsen");
    const id = await insert(m, "deletion");
    expect(await value("select status from public.data_requests where id = $1", [id])).toBe("pending");
    expect(await requestNotifications(m)).toBe(1);
    // A request of the other type is fine too.
    await insert(m, "export");
    expect(await requestNotifications(m)).toBe(2);
  });

  it("only one pending request per type", async () => {
    const m = await createMember("data-dublet");
    await insert(m, "deletion");
    const error = await expectError(insert(m, "deletion"), /data_requests_one_pending/);
    expect(error.code).toBe("23505");
    expect(await count("select 1 from public.data_requests where user_id = $1", [m])).toBe(1);
  });

  it("at most 5 requests per 24 hours, also when cancelling and sending again", async () => {
    const m = await createMember("data-loop");
    for (let i = 0; i < 5; i += 1) {
      await cancel(m, await insert(m, "deletion"));
    }
    const error = await expectError(insert(m, "deletion"), /Du har sendt mange anmodninger i dag/);
    expect(error.code).toBe("P0001");
    expect(await count("select 1 from public.data_requests where user_id = $1", [m])).toBe(5);
    expect(await requestNotifications(m)).toBe(5);
  });

  it("the server can still log completed exports without a limit", async () => {
    const m = await createMember("data-eksport");
    for (let i = 0; i < 7; i += 1) {
      await asService((c) =>
        c.query("insert into public.data_requests (user_id, type, status, completed_at) values ($1, 'export', 'completed', now())", [m]),
      );
    }
    expect(await count("select 1 from public.data_requests where user_id = $1 and status = 'completed'", [m])).toBe(7);
    expect(await requestNotifications(m)).toBe(0);
  });

  it("a member cannot cancel a request the administrator has claimed; an unclaimed one he can", async () => {
    const m = await createMember("data-claim");
    const id = await insert(m, "deletion");
    await asService((c) => c.query("update public.data_requests set handled_by = $2 where id = $1 and status = 'pending' and handled_by is null", [id, admin]));
    await expectDenied(cancel(m, id), /under behandling/);
    expect(await value("select status from public.data_requests where id = $1", [id])).toBe("pending");

    // The claim is released (e.g. a step of the deletion failed): cancelling works again.
    await asService((c) => c.query("update public.data_requests set handled_by = null where id = $1", [id]));
    await cancel(m, id);
    expect(await value("select status from public.data_requests where id = $1", [id])).toBe("canceled");
  });
});

// -----------------------------------------------------------------------------
describe("function privileges", () => {
  const replaced = [
    "_membership_state(uuid)",
    "membership_summary(uuid)",
    "_has_addon(uuid,text)",
    "can_see_profile(uuid)",
    "report_content(text,uuid,text)",
    "guard_onboarding()",
    "after_onboarding_change()",
    "after_data_request()",
    "guard_data_request()",
  ];

  it("visitors cannot execute the new or replaced functions", async () => {
    for (const fn of replaced) {
      const [r] = await sql<{ ok: boolean }>(`select has_function_privilege('anon', 'public.${fn}', 'execute') as ok`);
      expect({ fn, anon: r.ok }).toEqual({ fn, anon: false });
    }
  });

  it("internal helpers stay closed to members; the RPCs stay open", async () => {
    const access = async (fn: string) =>
      (await sql<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') as ok`))[0].ok;
    expect(await access("_membership_state(uuid)")).toBe(false);
    expect(await access("_has_addon(uuid,text)")).toBe(false);
    expect(await access("can_see_profile(uuid)")).toBe(true);
    expect(await access("membership_summary(uuid)")).toBe(true);
    expect(await access("report_content(text,uuid,text)")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe("the patch for live databases", () => {
  // Database objects that the migration and the patch must leave identical.
  const FINGERPRINT = `
    select 'column ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as item
      from information_schema.columns where table_schema = 'public'
    union all
    select 'policy ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || roles::text
           || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '')
      from pg_policies where schemaname in ('public', 'storage')
    union all
    select 'function ' || p.oid::regprocedure::text || ' ' || md5(p.prosrc) || ' ' || p.prosecdef::text
           || ' ' || coalesce(array_to_string(p.proconfig, ','), '')
           || ' anon=' || has_function_privilege('anon', p.oid, 'execute')::text
           || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text
           || ' service_role=' || has_function_privilege('service_role', p.oid, 'execute')::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    union all
    select 'index ' || indexname || ' ' || indexdef from pg_indexes where schemaname = 'public'
    order by 1`;

  let legacy: { client: Client; stop: () => Promise<void> } | null = null;
  const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await legacy!.client.query(text, params)).rows as T[];
  const one = async <T = unknown>(text: string, params: unknown[] = []) => Object.values((await q(text, params))[0] ?? {})[0] as T;

  beforeAll(async () => {
    // A live database: created with the earlier migrations and the 2026-10-30 patch.
    legacy = await startDatabaseFrom([
      "supabase/migrations/20261030000001_schema.sql",
      "supabase/migrations/20261030000002_storage.sql",
      "supabase/migrations/20261030000003_seed.sql",
      "supabase/migrations/20261030000050_announcements_profile.sql",
      "supabase/patches/2026-10-30-security-fixes.sql",
    ]);
  });
  afterAll(async () => {
    await legacy?.stop();
  });

  it("is the migration with a header on top", () => {
    const patch = repoFile(PATCH);
    expect(patch.endsWith(repoFile(MIGRATION))).toBe(true);
    expect(patch.slice(0, patch.length - repoFile(MIGRATION).length)).toMatch(/2026-10-30-security-fixes\.sql/);
  });

  it("runs twice on a live database, keeps its data and ends up identical to the migrations", async () => {
    // Existing data, including two pending deletion requests from one member
    // (possible before the unique index existed).
    const member = await one<string>("insert into auth.users (email, raw_user_meta_data) values ('live@test.dk', '{\"full_name\":\"Live Medlem\"}') returning id");
    await q(
      `insert into public.subscriptions (user_id, provider_subscription_id, status, product_id, current_period_end)
       values ($1, 'sub_live', 'active', (select id from public.products where slug = 'medlemskab'), now() + interval '20 days')`,
      [member],
    );
    await q("insert into public.community_messages (author_id, body) values ($1, 'Hej')", [member]);
    const first = await one<string>("insert into public.data_requests (user_id, type, created_at) values ($1, 'deletion', now() - interval '1 day') returning id", [member]);
    const second = await one<string>("insert into public.data_requests (user_id, type) values ($1, 'deletion') returning id", [member]);
    const before = await q("select (select count(*) from public.data_requests)::int as requests, (select count(*) from public.profiles)::int as profiles, (select count(*) from public.community_messages)::int as messages");

    const patch = repoFile(PATCH);
    await legacy!.client.query(patch);
    await legacy!.client.query(patch);

    expect(await q("select (select count(*) from public.data_requests)::int as requests, (select count(*) from public.profiles)::int as profiles, (select count(*) from public.community_messages)::int as messages")).toEqual(before);
    expect(await one("select public._membership_state($1)", [member])).toBe("active");
    const requests = await q<{ id: string; status: string; note: string | null }>("select id, status, note from public.data_requests order by created_at");
    expect(requests.map((r) => [r.id, r.status])).toEqual([
      [first, "pending"],
      [second, "canceled"],
    ]);
    expect(requests[1].note).toMatch(/Lukket automatisk/);

    const patched = (await q<{ item: string }>(FINGERPRINT)).map((r) => r.item);
    const migrated = (await sql<{ item: string }>(FINGERPRINT)).map((r) => r.item);
    expect(patched).toEqual(migrated);
  });
});
