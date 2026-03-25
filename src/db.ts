import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRESQL_ADDON_URI;
    if (!connectionString) {
      throw new Error("POSTGRESQL_ADDON_URI environment variable is required");
    }
    pool = new pg.Pool({ connectionString, max: 5 });
  }
  return pool;
}

export async function runMigrations(
  migrationsDir: string,
  log: (level: string, message: string) => void = () => {},
): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await db.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version"))
      .rows.map((r) => r.version),
  );

  const files = await readdir(migrationsDir);
  const pending = files
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => !applied.has(f));

  if (pending.length === 0) {
    log("info", "Migrations: all up to date");
    return;
  }

  for (const filename of pending) {
    const sql = await readFile(join(migrationsDir, filename), "utf-8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      log("info", `Migrations: applied ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  log("info", `Migrations: applied ${pending.length} migration(s)`);
}

export interface ResolvedRoute {
  targetId: string;
  authToken: string;
}

export async function resolveRouteFromDb(
  routeName: string,
): Promise<ResolvedRoute | null> {
  const result = await getPool().query<{
    target_id: string;
    auth_token: string;
  }>(
    `SELECT
       COALESCE(g.slashwork_id, r.stream_id) AS target_id,
       COALESCE(gt.token, rt.token) AS auth_token
     FROM routes r
     LEFT JOIN groups g ON r.group_name = g.name
     LEFT JOIN auth_tokens gt ON g.auth_token = gt.name
     LEFT JOIN auth_tokens rt ON r.auth_token = rt.name
     WHERE r.name = $1`,
    [routeName],
  );

  const row = result.rows[0];
  if (!row) return null;
  return { targetId: row.target_id, authToken: row.auth_token };
}

export interface DbRoute {
  name: string;
  targetId: string;
  authToken: string;
}

export interface DbAuthToken {
  name: string;
  tokenPreview: string;
}

export async function getAuthTokens(): Promise<DbAuthToken[]> {
  const result = await getPool().query<{ name: string; token: string }>(
    "SELECT name, token FROM auth_tokens ORDER BY name",
  );
  return result.rows.map((row) => ({
    name: row.name,
    tokenPreview: row.token.slice(0, 8) + "..." + row.token.slice(-4),
  }));
}

export interface DbGroup {
  name: string;
  slashworkId: string;
  authToken: string;
}

export async function getGroups(): Promise<DbGroup[]> {
  const result = await getPool().query<{
    name: string;
    slashwork_id: string;
    auth_token: string;
  }>("SELECT name, slashwork_id, auth_token FROM groups ORDER BY name");
  return result.rows.map((row) => ({
    name: row.name,
    slashworkId: row.slashwork_id,
    authToken: row.auth_token,
  }));
}

export interface DbRouteRow {
  name: string;
  groupName: string | null;
  streamId: string | null;
  authToken: string | null;
}

export async function getRoutes(): Promise<DbRouteRow[]> {
  const result = await getPool().query<{
    name: string;
    group_name: string | null;
    stream_id: string | null;
    auth_token: string | null;
  }>("SELECT name, group_name, stream_id, auth_token FROM routes ORDER BY name");
  return result.rows.map((row) => ({
    name: row.name,
    groupName: row.group_name,
    streamId: row.stream_id,
    authToken: row.auth_token,
  }));
}

export interface DbCalendarUser {
  name: string;
  calendarId: string;
  targetId: string;
}

export async function getCalendarUsers(): Promise<DbCalendarUser[]> {
  const result = await getPool().query<{
    name: string;
    calendar_id: string;
    target_id: string;
  }>("SELECT name, calendar_id, target_id FROM calendar_users ORDER BY name");
  return result.rows.map((row) => ({
    name: row.name,
    calendarId: row.calendar_id,
    targetId: row.target_id,
  }));
}

export async function getAuthToken(name: string): Promise<string | null> {
  const result = await getPool().query<{ token: string }>(
    "SELECT token FROM auth_tokens WHERE name = $1",
    [name],
  );
  return result.rows[0]?.token ?? null;
}

// Slashwork group discovery

export interface DiscoveredGroup {
  slashworkId: string;
  name: string;
  discoveredAt: Date;
  lastSeenAt: Date;
}

export async function upsertDiscoveredGroups(
  groups: Array<{ slashworkId: string; name: string }>,
): Promise<void> {
  if (groups.length === 0) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const g of groups) {
      await client.query(
        `INSERT INTO slashwork_groups (slashwork_id, name, last_seen_at)
         VALUES ($1, $2, now())
         ON CONFLICT (slashwork_id) DO UPDATE SET name = $2, last_seen_at = now()`,
        [g.slashworkId, g.name],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getDiscoveredGroups(): Promise<DiscoveredGroup[]> {
  const result = await getPool().query<{
    slashwork_id: string;
    name: string;
    discovered_at: Date;
    last_seen_at: Date;
  }>("SELECT slashwork_id, name, discovered_at, last_seen_at FROM slashwork_groups ORDER BY name");
  return result.rows.map((row) => ({
    slashworkId: row.slashwork_id,
    name: row.name,
    discoveredAt: row.discovered_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function getAllRoutes(): Promise<DbRoute[]> {
  const result = await getPool().query<{
    name: string;
    target_id: string;
    auth_token: string;
  }>(
    `SELECT
       r.name,
       COALESCE(g.slashwork_id, r.stream_id) AS target_id,
       COALESCE(gt.token, rt.token) AS auth_token
     FROM routes r
     LEFT JOIN groups g ON r.group_name = g.name
     LEFT JOIN auth_tokens gt ON g.auth_token = gt.name
     LEFT JOIN auth_tokens rt ON r.auth_token = rt.name`,
  );

  return result.rows.map((row) => ({
    name: row.name,
    targetId: row.target_id,
    authToken: row.auth_token,
  }));
}
