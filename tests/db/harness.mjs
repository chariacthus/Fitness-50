// Starts a throw-away Postgres (embedded-postgres), applies the Supabase shim
// and all migrations. Shared by the RLS tests and the type generator.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, readdirSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function startDatabase({ port } = {}) {
  // Postgres refuses to run as root, so the data dir must be world-accessible.
  const dir = mkdtempSync(join(tmpdir(), "staerk50-pg-"));
  chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, "data"),
    user: "postgres",
    password: "postgres",
    port: port ?? 55000 + Math.floor(Math.random() * 4000),
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();

  await client.query(readFileSync(join(root, "tests/db/supabase-shim.sql"), "utf8"));
  const migrationsDir = join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await client.query(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }

  return {
    client,
    async stop() {
      await client.end().catch(() => {});
      await pg.stop().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
