/**
 * Seeds the database with initial data.
 * Run migrations first: bun scripts/migrate.ts
 */
import pg from "pg";

const connectionString = process.env.POSTGRESQL_ADDON_URI;
if (!connectionString) {
  console.error("POSTGRESQL_ADDON_URI environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function seed() {
  console.log("Seeding database...");

  // Seed auth tokens from env vars
  const tokenEntries: Array<{ name: string; envVar: string }> = [
    { name: "skipper", envVar: "SLASHWORK_AUTH_TOKEN_SKIPPER" },
    { name: "skjs", envVar: "SLASHWORK_AUTH_TOKEN_SKJS" },
    { name: "skip", envVar: "SLASHWORK_AUTH_TOKEN_SKIP" },
  ];

  for (const { name, envVar } of tokenEntries) {
    const token = process.env[envVar];
    if (!token) {
      console.warn(`Skipping auth_token "${name}": ${envVar} not set`);
      continue;
    }
    await pool.query(
      `INSERT INTO auth_tokens (name, token) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET token = EXCLUDED.token`,
      [name, token],
    );
    console.log(`  auth_token "${name}" seeded`);
  }

  // Seed groups
  const groups = [
    { name: "skipper", slashworkId: "g_aVypv5BKvHiKP3tikjHjtj", authToken: "skipper" },
    { name: "skjs", slashworkId: "g_d_Px84GPeIF977BNqP0fGn", authToken: "skjs" },
    { name: "skip", slashworkId: "g_cQCWnkXg9OvL08OvMC6XKZ", authToken: "skip" },
  ];

  for (const g of groups) {
    await pool.query(
      `INSERT INTO groups (name, slashwork_id, auth_token) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET slashwork_id = EXCLUDED.slashwork_id, auth_token = EXCLUDED.auth_token`,
      [g.name, g.slashworkId, g.authToken],
    );
    console.log(`  group "${g.name}" seeded`);
  }

  // Seed routes
  const routes: Array<
    | { name: string; groupName: string; streamId?: undefined; authToken?: undefined }
    | { name: string; groupName?: undefined; streamId: string; authToken: string }
  > = [
    { name: "skipper", groupName: "skipper" },
    { name: "skjs", groupName: "skjs" },
    { name: "skip_stream", groupName: "skip" },
    { name: "skipper_stream", streamId: "g_dUYLNrxW7GzSxQwCKfGGQL", authToken: "skipper" },
    { name: "skjs_stream", streamId: "g_ekf0qeZiciWhPKidOUJNzt", authToken: "skjs" },
  ];

  for (const r of routes) {
    await pool.query(
      `INSERT INTO routes (name, group_name, stream_id, auth_token) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET group_name = EXCLUDED.group_name, stream_id = EXCLUDED.stream_id, auth_token = EXCLUDED.auth_token`,
      [r.name, r.groupName ?? null, r.streamId ?? null, r.authToken ?? null],
    );
    console.log(`  route "${r.name}" seeded`);
  }

  console.log("Done.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
