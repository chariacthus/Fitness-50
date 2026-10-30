// A small in-memory stand-in for the service-role Supabase client, with just
// the query-builder calls the payment code uses. Filters run on plain rows;
// column lists in select() are ignored (whole rows come back, so a test can
// seed embedded relations such as `products: { slug }` directly on a row).
// updated_at changes on every update, like the set_updated_at() trigger.

export type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Result = { data: unknown; error: DbError | null };
type Op = "select" | "insert" | "update" | "upsert";

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const failures: Array<{ table: string; op: Op; error: DbError; times: number }> = [];
  const rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  const writes: Array<{ table: string; op: Op; values: unknown; matched: number }> = [];
  let tick = 0;
  let ids = 0;

  const table = (name: string) => (tables[name] ??= []);
  const stamp = () => new Date(Date.UTC(2026, 9, 30, 12, 0, 0) + ++tick).toISOString();

  function takeFailure(name: string, op: Op) {
    const index = failures.findIndex((f) => f.table === name && f.op === op);
    if (index < 0) return null;
    const failure = failures[index];
    if (--failure.times <= 0) failures.splice(index, 1);
    return failure.error;
  }

  function insertRow(name: string, values: Row) {
    const now = stamp();
    const row: Row = { id: `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`, created_at: now, updated_at: now, ...values };
    table(name).push(row);
    return row;
  }

  class Query implements PromiseLike<Result> {
    private op: Op | null = null;
    private values: Row | null = null;
    private conflict: string[] = [];
    private returning = false;
    private mode: "many" | "maybe" | "one" = "many";
    private filters: Array<(row: Row) => boolean> = [];

    constructor(private readonly name: string) {}

    select() {
      if (this.op) this.returning = true;
      else this.op = "select";
      return this;
    }
    insert(values: Row) {
      this.op = "insert";
      this.values = values;
      return this;
    }
    update(values: Row) {
      this.op = "update";
      this.values = values;
      return this;
    }
    upsert(values: Row, options: { onConflict: string; ignoreDuplicates?: boolean }) {
      this.op = "upsert";
      this.values = values;
      this.conflict = options.onConflict.split(",").map((c) => c.trim());
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    neq(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) !== value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    not(column: string, operator: string, value: unknown) {
      if (operator !== "is") throw new Error(`fake-supabase: not.${operator} is not supported`);
      this.filters.push((row) => (row[column] ?? null) !== value);
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    single() {
      this.mode = "one";
      return this;
    }

    then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve()
        .then(() => this.run())
        .then(onFulfilled, onRejected);
    }

    private shape(rows: Row[]): Result {
      const copies = rows.map((row) => ({ ...row }));
      if (this.mode === "many") return { data: copies, error: null };
      if (copies.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
      if (this.mode === "one" && copies.length === 0) return { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: copies[0] ?? null, error: null };
    }

    private run(): Result {
      const op = this.op ?? "select";
      const failure = takeFailure(this.name, op);
      if (failure) return { data: null, error: failure };
      const matches = () => table(this.name).filter((row) => this.filters.every((f) => f(row)));

      if (op === "select") return this.shape(matches());

      if (op === "update") {
        const rows = matches();
        for (const row of rows) Object.assign(row, this.values, { updated_at: stamp() });
        writes.push({ table: this.name, op, values: this.values, matched: rows.length });
        return this.returning ? this.shape(rows) : { data: null, error: null };
      }

      const values = this.values ?? {};
      if (op === "upsert") {
        const exists = table(this.name).some((row) => this.conflict.every((c) => row[c] === values[c]));
        writes.push({ table: this.name, op, values, matched: exists ? 1 : 0 });
        if (exists) return this.returning ? this.shape([]) : { data: null, error: null };
      } else {
        writes.push({ table: this.name, op, values, matched: 0 });
      }
      const row = insertRow(this.name, values);
      return this.returning ? this.shape([row]) : { data: null, error: null };
    }
  }

  return {
    tables,
    writes,
    from: (name: string) => new Query(name),
    async rpc(name: string, args: Record<string, unknown>) {
      const handler = rpcs[name];
      if (!handler) return { data: null, error: { message: `fake-supabase: no rpc ${name}` } };
      return { data: handler(args), error: null };
    },
    /** Answers rpc(name) with the handler's return value. */
    onRpc(name: string, handler: (args: Record<string, unknown>) => unknown) {
      rpcs[name] = handler;
    },
    /** The next `times` calls of this operation on this table fail with the error. */
    failNext(name: string, op: Op, error: DbError, times = 1) {
      failures.push({ table: name, op, error, times });
    },
    rows: (name: string) => table(name),
  };
}
