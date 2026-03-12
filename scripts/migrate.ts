import { join } from "node:path";
import { runMigrations } from "../src/db";

const migrationsDir = join(import.meta.dirname, "..", "migrations");

function log(level: string, message: string) {
  console.log(`[${level}] ${message}`);
}

runMigrations(migrationsDir, log)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
