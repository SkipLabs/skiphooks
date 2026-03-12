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

  const seededTokens = new Set<string>();
  for (const { name, envVar } of tokenEntries) {
    const token = process.env[envVar];
    if (!token) {
      console.warn(`  Skipping auth_token "${name}": ${envVar} not set`);
      continue;
    }
    await pool.query(
      `INSERT INTO auth_tokens (name, token) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET token = EXCLUDED.token`,
      [name, token],
    );
    seededTokens.add(name);
    console.log(`  auth_token "${name}" seeded`);
  }

  // Seed groups (skip if auth token wasn't seeded)
  const groups = [
    { name: "skipper", slashworkId: "g_aVypv5BKvHiKP3tikjHjtj", authToken: "skipper" },
    { name: "skjs", slashworkId: "g_d_Px84GPeIF977BNqP0fGn", authToken: "skjs" },
    { name: "skip", slashworkId: "g_cQCWnkXg9OvL08OvMC6XKZ", authToken: "skip" },
  ];

  const seededGroups = new Set<string>();
  for (const g of groups) {
    // Check if token exists in DB (may have been seeded in a previous run)
    const tokenExists = seededTokens.has(g.authToken) ||
      (await pool.query("SELECT 1 FROM auth_tokens WHERE name = $1", [g.authToken])).rows.length > 0;
    if (!tokenExists) {
      console.warn(`  Skipping group "${g.name}": auth_token "${g.authToken}" not available`);
      continue;
    }
    await pool.query(
      `INSERT INTO groups (name, slashwork_id, auth_token) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET slashwork_id = EXCLUDED.slashwork_id, auth_token = EXCLUDED.auth_token`,
      [g.name, g.slashworkId, g.authToken],
    );
    seededGroups.add(g.name);
    console.log(`  group "${g.name}" seeded`);
  }

  // Seed routes (skip if dependencies aren't available)
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
    if (r.groupName) {
      const groupExists = seededGroups.has(r.groupName) ||
        (await pool.query("SELECT 1 FROM groups WHERE name = $1", [r.groupName])).rows.length > 0;
      if (!groupExists) {
        console.warn(`  Skipping route "${r.name}": group "${r.groupName}" not available`);
        continue;
      }
    }
    if (r.authToken) {
      const tokenExists = seededTokens.has(r.authToken) ||
        (await pool.query("SELECT 1 FROM auth_tokens WHERE name = $1", [r.authToken])).rows.length > 0;
      if (!tokenExists) {
        console.warn(`  Skipping route "${r.name}": auth_token "${r.authToken}" not available`);
        continue;
      }
    }
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
