import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const connectionString = process.env.POSTGRESQL_ADDON_URI;
if (!connectionString) {
  console.error("POSTGRESQL_ADDON_URI environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const migrationsDir = join(import.meta.dirname, "..", "migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  return new Set(result.rows.map((r) => r.version));
}

async function getPendingMigrations(applied: Set<string>): Promise<string[]> {
  const files = await readdir(migrationsDir);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !applied.has(f));
}

async function runMigration(filename: string) {
  const sql = await readFile(join(migrationsDir, filename), "utf-8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1)",
      [filename],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (applied.size > 0) {
    console.log(`Already applied: ${[...applied].join(", ")}`);
  }

  const pending = await getPendingMigrations(applied);
  if (pending.length === 0) {
    console.log("No pending migrations.");
    await pool.end();
    return;
  }

  console.log(`Pending: ${pending.join(", ")}`);

  for (const filename of pending) {
    console.log(`Applying ${filename}...`);
    await runMigration(filename);
    console.log(`  Done.`);
  }

  console.log(`Applied ${pending.length} migration(s).`);
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
