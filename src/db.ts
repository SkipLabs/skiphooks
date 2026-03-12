import pg from "pg";

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
