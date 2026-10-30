import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, createAdmin, createMember, expectDenied, setupDatabase, sql, teardownDatabase } from "./helpers";

// Visitors (role anon, not logged in) may read the public site settings and
// the active products – nothing else, and they cannot call the app's RPCs.

let member: string;

beforeAll(async () => {
  await setupDatabase();
  await createAdmin();
  member = await createMember("besoegende", "Jens Hansen");
  await sql(
    `insert into public.products (slug, kind, name, billing_interval, is_active, price_amount)
     values ('skjult-produkt', 'addon', 'Skjult produkt', 'one_time', false, 1000)`,
  );
  await sql("insert into public.notifications (user_id, type, title) values ($1, 'system', 'Hej')", [member]);
  await sql("insert into public.community_messages (author_id, body) values ($1, 'Hej alle')", [member]);
  await sql(
    "insert into public.announcements (title, body, status, published_at) values ('Nyt opslag', 'Tekst', 'published', now() - interval '1 hour')",
  );
  await sql("insert into public.contact_messages (name, email, message) values ('Ole', 'ole@test.dk', 'Hej')");
});
afterAll(teardownDatabase);

const anonRows = (text: string, params: unknown[] = []) => asAnon(async (c) => (await c.query(text, params)).rows);

describe("visitors can read", () => {
  it("the public site settings", async () => {
    const rows = await anonRows("select business_name, coach_name from public.site_settings");
    expect(rows).toHaveLength(1);
    expect(rows[0].business_name).toBe("Stærk50");
  });

  it("only active products", async () => {
    const rows = await anonRows("select slug from public.products order by sort_order");
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(["medlemskab", "kostplan"]));
    expect(slugs).not.toContain("skjult-produkt");
  });
});

describe("visitors cannot read private data", () => {
  const privateTables = [
    "profiles",
    "profile_private",
    "onboarding_submissions",
    "subscriptions",
    "purchases",
    "payment_events",
    "billing_customers",
    "user_roles",
    "admin_settings",
    "community_messages",
    "private_messages",
    "conversations",
    "announcements",
    "notifications",
    "contact_messages",
    "training_plans",
    "nutrition_plans",
    "reports",
    "data_requests",
    "media",
  ];
  for (const table of privateTables) {
    it(`public.${table}`, async () => {
      await expectDenied(anonRows(`select * from public.${table} limit 1`), /permission denied/);
    });
  }

  it("storage objects outside the public site bucket", async () => {
    await sql("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${member}/a.jpg`]);
    await sql("insert into storage.objects (bucket_id, name) values ('announcements', 'x/b.jpg')");
    const rows = await anonRows("select name from storage.objects");
    expect(rows).toEqual([]);
  });
});

describe("visitors cannot write", () => {
  it("contact messages (the contact form goes through the server)", async () => {
    await expectDenied(
      anonRows("insert into public.contact_messages (name, email, message) values ('Ole', 'ole@test.dk', 'Hej')"),
    );
  });

  it("site settings or products", async () => {
    await expectDenied(anonRows("update public.site_settings set business_name = 'Hacket'"));
    await expectDenied(
      anonRows("insert into public.products (slug, kind, name, billing_interval) values ('ny', 'addon', 'Ny', 'one_time')"),
    );
  });

  it("storage uploads", async () => {
    await expectDenied(anonRows("insert into storage.objects (bucket_id, name) values ('site', 'logo.png')"));
    await expectDenied(anonRows("insert into storage.objects (bucket_id, name) values ('avatars', 'x/a.jpg')"));
  });
});

describe("visitors cannot call the app's functions", () => {
  const rpcs = [
    ["membership_state($1)", [() => member]],
    ["membership_summary($1)", [() => member]],
    ["get_or_create_direct_conversation($1)", [() => member]],
    ["report_content('profile', $1, 'spam')", [() => member]],
    ["unread_counts()", []],
    ["my_conversations()", []],
    ["mark_notifications_read()", []],
    ["mark_community_read()", []],
    ["admin_overview_stats()", []],
    ["admin_member_list()", []],
    ["grant_addon($1, 'kostplan')", [() => member]],
    ["has_addon('kostplan')", []],
    ["can_use_community()", []],
    ["_membership_state($1)", [() => member]],
    ["_notify_admins('system', 'x', null, null)", []],
    ["bootstrap_admin('x@test.dk')", []],
    ["check_rate_limit('x', 1, 1)", []],
  ] as const;
  for (const [call, params] of rpcs) {
    it(call, async () => {
      const values = params.map((p) => p());
      await expectDenied(anonRows(`select public.${call}`, values), /permission denied for function/);
    });
  }

  it("only is_admin() and is_entitled() (used by public policies) are executable, and both say no", async () => {
    const rows = await sql<{ proname: string }>(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    // A new function here means a migration forgot: revoke execute on function … from public, anon;
    expect(rows.map((r) => r.proname)).toEqual(["is_admin", "is_entitled"]);
    const [flags] = await anonRows("select public.is_admin() as admin, public.is_entitled() as entitled");
    expect(flags).toEqual({ admin: false, entitled: false });
  });
});

describe("function privileges for logged-in users", () => {
  it("internal helpers are not executable by authenticated users", async () => {
    const internal = [
      "_notify_admins(text,text,text,text,jsonb)",
      "_notify_user(uuid,text,text,text,text,jsonb)",
      "_membership_state(uuid)",
      "_is_entitled_user(uuid)",
      "_is_admin_user(uuid)",
      "_has_addon(uuid,text)",
      "_post_community_welcome(uuid)",
      "bootstrap_admin(text)",
      "check_rate_limit(text,integer,integer)",
      "handle_new_user()",
      "handle_user_email_change()",
    ];
    for (const fn of internal) {
      const allowed = await sql<{ ok: boolean }>(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') as ok`);
      expect({ fn, ok: allowed[0].ok }).toEqual({ fn, ok: false });
    }
  });

  it("every SECURITY DEFINER function pins search_path", async () => {
    const rows = await sql<{ proname: string }>(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows).toEqual([]);
  });

  it("every table in public has row level security enabled", async () => {
    const rows = await sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});
