import { loadConfig } from "@/src/config";
import { validateConnection, type SlashworkConnection } from "@/src/slashwork";
import { validateCalendarAuth } from "@/src/calendar/auth";
import { startCalendarPoller } from "@/src/calendar/poller";

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

export async function register() {
  const config = loadConfig();

  const routeNames = Object.keys(config.routes);
  log("info", `Routes: ${routeNames.map((n) => `/github/${n}`).join(", ")}`);
  log("info", `Slashwork URL: ${config.slashwork.graphqlUrl}`);

  for (const name of routeNames) {
    const route = config.routes[name]!;
    let authToken: string;
    if ("group" in route) {
      authToken = config.groups![route.group]!.authToken;
    } else {
      authToken = route.authToken;
    }

    const conn: SlashworkConnection = {
      graphqlUrl: config.slashwork.graphqlUrl,
      authToken,
    };

    log("info", `Route ${name}: auth token configured`);
    validateConnection(conn).then(
      () => log("info", `Route ${name}: auth validated`),
      (err) => log("error", `Route ${name}: ${err}`),
    );
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
