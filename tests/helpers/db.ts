import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function setupTestDb(): Promise<postgres.Sql> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }

  const sql = postgres(url);

  // Run migration 003
  const migrationPath = join(
    import.meta.dir,
    "../../migrations/003_reddit_scout.sql"
  );
  const migration = readFileSync(migrationPath, "utf-8");

  // Create tables if they don't exist (idempotent via IF NOT EXISTS workaround)
  try {
    await sql.unsafe(migration);
  } catch (e: unknown) {
    // Tables may already exist — that's fine
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists")) throw e;
  }

  return sql;
}

export async function truncateTables(sql: postgres.Sql): Promise<void> {
  await sql`TRUNCATE queue_items, saved_threads, crawl_runs CASCADE`;
}

export async function teardownTestDb(sql: postgres.Sql): Promise<void> {
  await truncateTables(sql);
  await sql.end();
}
