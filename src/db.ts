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
