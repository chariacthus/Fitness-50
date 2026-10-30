// Order of the steps in "Gennemfør sletning" (completeDeletion), with fake
// Supabase and Stripe clients. The database rules themselves are tested in
// tests/db; this checks that the server action claims the request before
// anything irreversible, releases the claim when a step fails, and removes
// the member's content from reports before the account is deleted.

import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";

type Filter = [kind: string, column: string, value: unknown];
type Call = { table: string; op: "select" | "update" | "delete"; values?: Record<string, unknown>; filters: Filter[] };
type Result = { data?: unknown; error?: { message: string; code?: string } | null };

const log: string[] = [];
const calls: Call[] = [];
let respond: (call: Call) => Result = () => ({});

function fakeSupabase(name: string) {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        delete: () => {
          call.op = "delete";
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push(["eq", column, value]);
          return builder;
        },
        is: (column: string, value: unknown) => {
          call.filters.push(["is", column, value]);
          return builder;
        },
        maybeSingle: () => builder,
        then(resolve: (value: { data: unknown; error: unknown }) => void, reject: (reason: unknown) => void) {
          calls.push(call);
          log.push(`${name}:${call.op}:${table}`);
          return Promise.resolve(respond(call))
            .then((r) => ({ data: r.data ?? null, error: r.error ?? null }))
            .then(resolve, reject);
        },
      };
      return builder;
    },
    storage: {},
    auth: {
      admin: {
        deleteUser: vi.fn(async () => {
          log.push("deleteUser");
          return { error: deleteUserError };
        }),
      },
    },
  };
}

let deleteUserError: { status: number; message: string } | null = null;
let storageOk = true;
let stripeCancel: (id: string) => Promise<unknown> = async () => ({});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/auth", () => ({ getAdminOrNull: async () => ({ userId: ADMIN }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabase("rls") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase("service") }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: (id: string) => {
        log.push(`stripe:cancel:${id}`);
        return stripeCancel(id);
      },
    },
  }),
}));
vi.mock("@/lib/profile/storage-cleanup", () => ({
  removeStorageFolder: async (_client: unknown, bucket: string) => {
    log.push(`storage:${bucket}`);
    return storageOk;
  },
}));

const { completeDeletion } = await import("@/app/admin/anmodninger/actions");

const has = (call: Call, kind: string, column: string, value: unknown) =>
  call.filters.some(([k, c, v]) => k === kind && c === column && v === value);
const isClaim = (c: Call) => c.table === "data_requests" && c.op === "update" && c.values?.handled_by === ADMIN;
const isRelease = (c: Call) =>
  c.table === "data_requests" && c.op === "update" && c.values?.handled_by === null && c.values?.status === undefined;
const isComplete = (c: Call) => c.table === "data_requests" && c.op === "update" && c.values?.status === "completed";
const isRedaction = (c: Call) => c.table === "reports" && c.op === "update";

/** Healthy database: a pending deletion request with one running Stripe subscription. */
function healthy(overrides: (call: Call) => Result | undefined = () => undefined): (call: Call) => Result {
  return (call) => {
    const special = overrides(call);
    if (special) return special;
    if (call.table === "data_requests" && call.op === "select") {
      return { data: { id: REQUEST, user_id: MEMBER, type: "deletion", status: "pending" } };
    }
    if (call.table === "user_roles") return { data: null };
    if (call.table === "subscriptions") {
      return { data: [{ id: "s1", provider: "stripe", provider_subscription_id: "sub_123", status: "active" }] };
    }
    if (call.table === "data_requests" && call.op === "update") return { data: { id: REQUEST } };
    return {};
  };
}

async function run() {
  const form = new FormData();
  form.set("id", REQUEST);
  try {
    return { state: await completeDeletion({ ok: false, error: "" }, form), redirectedTo: null };
  } catch (error) {
    const url = (error as { url?: string }).url;
    if (!url) throw error;
    return { state: null, redirectedTo: url };
  }
}

beforeEach(() => {
  log.length = 0;
  calls.length = 0;
  deleteUserError = null;
  storageOk = true;
  stripeCancel = async () => ({});
  respond = healthy();
});

describe("completeDeletion", () => {
  it("claims first, redacts reports and only then deletes the account", async () => {
    const { redirectedTo } = await run();
    expect(redirectedTo).toBe("/admin/anmodninger?udfoert=slettet&abonnementer=1");

    const claim = calls.find(isClaim)!;
    expect(claim).toBeDefined();
    expect(has(claim, "eq", "status", "pending")).toBe(true);
    expect(has(claim, "is", "handled_by", null)).toBe(true);

    const redaction = calls.find(isRedaction)!;
    expect(redaction.values).toEqual({ snapshot: "[Slettet efter anmodning]" });
    expect(has(redaction, "eq", "target_user_id", MEMBER)).toBe(true);

    const complete = calls.find(isComplete)!;
    expect(has(complete, "eq", "handled_by", ADMIN)).toBe(true);
    expect(has(complete, "eq", "status", "pending")).toBe(true);

    const at = (entry: string) => log.indexOf(entry);
    expect(at("service:update:data_requests")).toBeGreaterThan(-1);
    expect(at("service:update:data_requests")).toBeLessThan(at("stripe:cancel:sub_123"));
    expect(at("stripe:cancel:sub_123")).toBeLessThan(at("service:delete:community_messages"));
    expect(at("service:update:reports")).toBeLessThan(at("deleteUser"));
    expect(log.lastIndexOf("service:update:data_requests")).toBeLessThan(at("deleteUser"));
    expect(calls.some(isRelease)).toBe(false);
  });

  it("stops before anything is changed when the request is already claimed or cancelled", async () => {
    respond = healthy((call) => (isClaim(call) ? { data: null } : undefined));
    const { state } = await run();
    expect(state?.ok).toBe(false);
    expect(state && !state.ok && state.error).toMatch(/allerede ved at blive behandlet/);
    expect(log.some((e) => e.startsWith("stripe:"))).toBe(false);
    expect(log.some((e) => e.includes(":delete:") || e.startsWith("storage:") || e === "deleteUser")).toBe(false);
    expect(calls.some(isRedaction)).toBe(false);
  });

  it("releases the claim when Stripe fails, and deletes nothing", async () => {
    stripeCancel = async () => {
      throw Object.assign(new Error("boom"), { statusCode: 500 });
    };
    const { state } = await run();
    expect(state?.ok).toBe(false);
    const release = calls.find(isRelease)!;
    expect(release).toBeDefined();
    expect(has(release, "eq", "handled_by", ADMIN)).toBe(true);
    expect(has(release, "eq", "status", "pending")).toBe(true);
    expect(log.some((e) => e.includes(":delete:") || e === "deleteUser")).toBe(false);
  });

  it("releases the claim when the files cannot be removed", async () => {
    storageOk = false;
    const { state } = await run();
    expect(state?.ok).toBe(false);
    expect(calls.some(isRelease)).toBe(true);
    expect(calls.some(isComplete)).toBe(false);
    expect(log).not.toContain("deleteUser");
  });

  it("keeps the account when the report copies cannot be removed", async () => {
    respond = healthy((call) => (isRedaction(call) ? { error: { message: "nope" } } : undefined));
    const { state } = await run();
    expect(state?.ok).toBe(false);
    expect(state && !state.ok && state.error).toMatch(/anmeldelserne/);
    expect(calls.some(isRelease)).toBe(true);
    expect(calls.some(isComplete)).toBe(false);
    expect(log).not.toContain("deleteUser");
  });

  it("releases the claim when the request cannot be marked completed", async () => {
    respond = healthy((call) => (isComplete(call) ? { data: null } : undefined));
    const { state } = await run();
    expect(state?.ok).toBe(false);
    expect(calls.some(isRelease)).toBe(true);
    expect(log).not.toContain("deleteUser");
  });

  it("reopens the request (own claim only) when the account cannot be deleted", async () => {
    deleteUserError = { status: 500, message: "boom" };
    const { state } = await run();
    expect(state?.ok).toBe(false);
    const reopen = calls.filter((c) => c.table === "data_requests" && c.op === "update" && c.values?.status === "pending");
    expect(reopen).toHaveLength(1);
    expect(reopen[0].values).toEqual({ status: "pending", handled_by: null, completed_at: null });
    expect(has(reopen[0], "eq", "handled_by", ADMIN)).toBe(true);
    expect(has(reopen[0], "eq", "status", "completed")).toBe(true);
  });
});
