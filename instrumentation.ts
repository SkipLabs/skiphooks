import { loadAppConfig } from "@/src/config";
import { getAllRoutes } from "@/src/db";
import { validateConnection, type SlashworkConnection } from "@/src/slashwork";
import { validateCalendarAuth } from "@/src/calendar/auth";
import { startCalendarPoller } from "@/src/calendar/poller";

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

export async function register() {
  const config = loadAppConfig();

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

  if (config.calendar) {
    const cal = config.calendar;

    validateCalendarAuth(cal.serviceAccountKey).then(
      () => {
        log("info", "Calendar: Google auth validated");
        startCalendarPoller(cal, config.slashwork.graphqlUrl, log);
      },
      (err) => log("error", `Calendar: auth failed — ${err}`),
    );
  }
}
