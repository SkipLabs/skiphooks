import { PostgresExternalService } from "@skip-adapter/postgres";

function parseConnectionString(uri: string) {
  const url = new URL(uri);
  return {
    host: url.hostname,
    port: parseInt(url.port || "5432", 10),
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

const connectionString = process.env.POSTGRESQL_ADDON_URI;
if (!connectionString) {
  throw new Error("POSTGRESQL_ADDON_URI is required for Skip adapter");
}

export const postgresExternalService = new PostgresExternalService(
  parseConnectionString(connectionString),
);
