import postgres from "postgres";

let sql: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  if (!sql) {
    const url = process.env.POSTGRESQL_ADDON_URI;
    if (!url) {
      throw new Error("POSTGRESQL_ADDON_URI environment variable is required");
    }
    sql = postgres(url);
  }
  return sql;
}
