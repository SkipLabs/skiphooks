import { join } from "node:path";
import { loadAppConfig } from "@/src/config";
import { runMigrations, getAllRoutes, getCalendarUsers, getAuthToken } from "@/src/db";
import { validateConnection, type SlashworkConnection } from "@/src/slashwork";
import { validateCalendarAuth } from "@/src/calendar/auth";
import { startCalendarPoller } from "@/src/calendar/poller";

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

export async function register() {
  const config = loadAppConfig();

  await runMigrations(join(process.cwd(), "migrations"), log);

  log("info", `Slashwork URL: ${config.slashwork.graphqlUrl}`);

  try {
    const routes = await getAllRoutes();
    log("info", `Routes: ${routes.map((r) => `/github/${r.name}`).join(", ")}`);

    for (const route of routes) {
      const conn: SlashworkConnection = {
        graphqlUrl: config.slashwork.graphqlUrl,
        authToken: route.authToken,
      };

      log("info", `Route ${route.name}: auth token configured`);
      validateConnection(conn).then(
        () => log("info", `Route ${route.name}: auth validated`),
        (err) => log("error", `Route ${route.name}: ${err}`),
      );
    }
  } catch (err) {
    log("error", `Failed to load routes from DB: ${err}`);
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const calendarAuthToken = await getAuthToken("google_calendar");
      const calendarUsers = await getCalendarUsers();

      if (!calendarAuthToken) {
        log("error", 'Calendar: auth_token "google_calendar" not found in DB');
        return;
      }
      if (calendarUsers.length === 0) {
        log("warn", "Calendar: no users configured in DB");
        return;
      }

      const calendarConfig = {
        serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
        authToken: calendarAuthToken,
        users: calendarUsers,
      };

      validateCalendarAuth(calendarConfig.serviceAccountKey).then(
        () => {
          log("info", "Calendar: Google auth validated");
          startCalendarPoller(calendarConfig, config.slashwork.graphqlUrl, log);
        },
        (err) => log("error", `Calendar: auth failed — ${err}`),
      );
    } catch (err) {
      log("error", `Calendar: failed to load config from DB: ${err}`);
    }
  }
}
