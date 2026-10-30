// Helpers for the database security tests. Each test file starts its own
// throw-away Postgres (see harness.mjs) in beforeAll and stops it in afterAll.
// Statements run as `postgres` (the database owner) unless wrapped in
// asUser / asAnon / asService, which switch to the Supabase API roles the way
// PostgREST does: `set local role …` plus `request.jwt.claims`.
import EmbeddedPostgres from "embedded-postgres";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { startDatabase } from "./harness.mjs";

export type Row = Record<string, unknown>;
export type QueryResult = { rows: Row[]; rowCount: number | null };
export type Client = { query: (sql: string, params?: unknown[]) => Promise<QueryResult> };
type TestDb = { client: Client; stop: () => Promise<void> };

let db: TestDb | null = null;

export async function setupDatabase() {
  db = (await startDatabase()) as unknown as TestDb;
  return db;
}

export async function teardownDatabase() {
  await db?.stop();
  db = null;
}

function client(): Client {
  if (!db) throw new Error("setupDatabase() must run in beforeAll first");
  return db.client;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Contents of a file in the repository, e.g. "supabase/patches/….sql". */
export function repoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

/**
 * A second, separate throw-away Postgres built from the Supabase shim plus only
 * the given SQL files (paths relative to the repository root, applied in
 * order). Used to test a patch against a database created with the earlier
 * migrations. The caller stops it with stop(). The sql/asUser helpers keep
 * using the main test database.
 */
export async function startDatabaseFrom(files: string[]): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "staerk50-pg-"));
  chmodSync(dir, 0o777); // Postgres refuses to run as root (see harness.mjs).
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, "data"),
    user: "postgres",
    password: "postgres",
    port: 55000 + Math.floor(Math.random() * 4000),
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const pgClient = pg.getPgClient();
  await pgClient.connect();
  const stop = async () => {
    await pgClient.end().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    await pgClient.query(repoFile("tests/db/supabase-shim.sql"));
    for (const file of files) {
      try {
        await pgClient.query(repoFile(file));
      } catch (error) {
        throw new Error(`${file} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return { client: pgClient as unknown as Client, stop };
}

/** Runs a statement as the database owner (bypasses RLS). Returns the rows. */
export async function sql<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await client().query(text, params)).rows as T[];
}

/** First column of the first row, as the database owner. */
export async function value<T = unknown>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql(text, params);
  const first = rows[0];
  return (first ? Object.values(first)[0] : undefined) as T;
}

// ---------------------------------------------------------------------------
// Users, roles and subscriptions (set up as the database owner)
// ---------------------------------------------------------------------------

let userCounter = 0;

/** Unique e-mail so test files never collide, e.g. "jens-3@test.dk". */
export function uniqueEmail(prefix: string) {
  userCounter += 1;
  return `${prefix}-${userCounter}-${Math.random().toString(36).slice(2, 8)}@test.dk`;
}

/** Inserts an auth user; the on_auth_user_created trigger creates the profile rows. */
export async function createUser(email: string, fullName = ""): Promise<string> {
  return value<string>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id",
    [email, fullName],
  );
}

/** Grants the admin role the supported way (bootstrap_admin, as the database owner). */
export async function makeAdmin(email: string): Promise<string> {
  return value<string>("select public.bootstrap_admin($1)", [email]);
}

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

type Timestamp = Date | string | null;
export type SubscriptionExtra = {
  /** Distinguishes several subscriptions for the same user (default "main"). */
  ref?: string;
  /** Product slug (default "medlemskab"). */
  product?: string;
  cancel_at_period_end?: boolean;
  cancel_at?: Timestamp;
  current_period_start?: Timestamp;
  current_period_end?: Timestamp;
  payment_failed_at?: Timestamp;
  canceled_at?: Timestamp;
  ended_at?: Timestamp;
  created_at?: Timestamp;
  amount?: number | null;
};

const SUBSCRIPTION_COLUMNS = [
  "cancel_at_period_end",
  "cancel_at",
  "current_period_start",
  "current_period_end",
  "payment_failed_at",
  "canceled_at",
  "ended_at",
  "created_at",
  "amount",
] as const;

/**
 * Inserts or updates a subscription for the membership product, as the server
 * (webhook) would. Unless given, current_period_end defaults to 20 days ahead.
 */
export async function setSubscription(userId: string, status: SubscriptionStatus, extra: SubscriptionExtra = {}) {
  const { ref = "main", product = "medlemskab" } = extra;
  const values: Record<string, unknown> = { current_period_end: daysFromNow(20), ...extra };
  const columns = SUBSCRIPTION_COLUMNS.filter((c) => c in values);
  const params: unknown[] = [userId, `sub_${ref}_${userId}`, status, product, ...columns.map((c) => values[c])];
  const insertCols = columns.map((c) => `, ${c}`).join("");
  const insertVals = columns.map((_, i) => `, $${i + 5}`).join("");
  const updates = ["status = excluded.status", ...columns.map((c) => `${c} = excluded.${c}`)].join(", ");
  return value<string>(
    `insert into public.subscriptions (user_id, provider_subscription_id, status, product_id${insertCols})
     values ($1, $2, $3, (select id from public.products where slug = $4)${insertVals})
     on conflict (provider, provider_subscription_id) do update set ${updates}
     returning id`,
    params,
  );
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** A new user with an active membership. */
export async function createMember(prefix: string, fullName = prefix) {
  const id = await createUser(uniqueEmail(prefix), fullName);
  await setSubscription(id, "active");
  return id;
}

/** A new administrator (also becomes the coach account when none is set). */
export async function createAdmin(prefix = "admin", fullName = "Træneren") {
  const email = uniqueEmail(prefix);
  await createUser(email, fullName);
  return makeAdmin(email);
}

// ---------------------------------------------------------------------------
// Acting as API roles
// ---------------------------------------------------------------------------

type RunOptions = { rollback?: boolean };

async function runAs<T>(role: string, claims: Row, fn: (c: Client) => Promise<T>, options: RunOptions): Promise<T> {
  const c = client();
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(c);
    await c.query(options.rollback ? "rollback" : "commit");
    return result;
  } catch (error) {
    await c.query("rollback");
    throw error;
  }
}

/** Runs fn as a logged-in user (role authenticated). Commits unless { rollback: true }; rolls back on error. */
export function asUser<T>(userId: string, fn: (c: Client) => Promise<T>, options: RunOptions = {}) {
  return runAs("authenticated", { sub: userId, role: "authenticated" }, fn, options);
}

/** Runs fn as a visitor (role anon, no user id). */
export function asAnon<T>(fn: (c: Client) => Promise<T>, options: RunOptions = {}) {
  return runAs("anon", { role: "anon" }, fn, options);
}

/** Runs fn as the server (role service_role, bypasses RLS like the admin client). */
export function asService<T>(fn: (c: Client) => Promise<T>, options: RunOptions = {}) {
  return runAs("service_role", { role: "service_role" }, fn, options);
}

/** Rows of one statement run as the given user. */
export function rowsAs<T extends Row = Row>(userId: string, text: string, params: unknown[] = []) {
  return asUser(userId, async (c) => (await c.query(text, params)).rows as T[]);
}

/** First column of the first row of one statement run as the given user. */
export function valueAs<T = unknown>(userId: string, text: string, params: unknown[] = []) {
  return asUser(userId, async (c) => {
    const first = (await c.query(text, params)).rows[0];
    return (first ? Object.values(first)[0] : undefined) as T;
  });
}

/** Number of rows an UPDATE/DELETE touched when run as the given user. */
export function rowCountAs(userId: string, text: string, params: unknown[] = []) {
  return asUser(userId, async (c) => (await c.query(text, params)).rowCount ?? 0);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export type DbError = Error & { code?: string };

/**
 * Danish exceptions raised by the guard triggers and RPCs when something is not
 * allowed. Most use SQLSTATE 42501; a few validation-style refusals use
 * 22023/P0001, so they are matched by message.
 */
const DANISH_REFUSAL =
  /tilladelse|tilladt|Kun administratorer|kræver|kan ikke|kan kun|skal være logget ind|Ikke logget ind|ikke adgang|ikke fundet|hurtigt|Vælg en anden/i;

/** Expects the statement to be refused: permission denied, an RLS violation or a Danish guard exception. */
export async function expectDenied(promise: Promise<unknown>, message?: RegExp): Promise<DbError> {
  const error = await expectError(promise);
  const allowed =
    error.code === "42501" || // insufficient_privilege: permission denied, RLS violation, guard triggers
    ((error.code === "P0001" || error.code === "22023") && DANISH_REFUSAL.test(error.message));
  if (!allowed) {
    throw new Error(`Forventede en afvisning, men fik ${error.code}: ${error.message}`);
  }
  if (message) expect(error.message).toMatch(message);
  return error;
}

/** Expects any database error and returns it. */
export async function expectError(promise: Promise<unknown>, message?: RegExp): Promise<DbError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (!caught) throw new Error("Forventede en fejl fra databasen, men handlingen lykkedes");
  const error = caught as DbError;
  if (message) expect(error.message).toMatch(message);
  return error;
}

/** Shortcut: an RLS "new row violates row-level security policy" error. */
export async function expectRlsViolation(promise: Promise<unknown>) {
  return expectDenied(promise, /row-level security/);
}
