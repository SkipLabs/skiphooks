import { join } from "node:path";
import pg from "pg";
import { loadAppConfig } from "@/src/config";
import { runMigrations, getAllRoutes, getCalendarUsers, getAuthToken } from "@/src/db";
import { validateConnection, type SlashworkConnection } from "@/src/slashwork";
import { validateCalendarAuth } from "@/src/calendar/auth";
import { startCalendarPoller } from "@/src/calendar/poller";
import { startGroupSyncPoller } from "@/src/slashwork-sync";
import { startWeeklyDigestPoller } from "@/src/weekly-digest";
import { runService, type SkipServer } from "@skipruntime/server";
import { skipService } from "@/src/skip/service";
import { postgresExternalService } from "@/src/skip/postgres-adapter";

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

const SKIP_MONITORED_TABLES = ["slashwork_groups", "auth_tokens", "groups", "routes"];

let skipStarted = false;
let skipServer: SkipServer | null = null;
let skipWatchdogInterval: ReturnType<typeof setInterval> | null = null;

async function cleanupOrphanSkipTriggers(): Promise<void> {
  const connectionString = process.env.POSTGRESQL_ADDON_URI;
  if (!connectionString) return;

  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      `SELECT trigger_name, event_object_table
       FROM information_schema.triggers
       WHERE event_object_table = ANY($1)
         AND trigger_schema = 'public'`,
      [SKIP_MONITORED_TABLES],
    );
    if (result.rows.length > 0) {
      for (const row of result.rows) {
        const { trigger_name, event_object_table } = row as {
          trigger_name: string;
          event_object_table: string;
        };
        await client.query(
          `DROP TRIGGER IF EXISTS "${trigger_name}" ON "${event_object_table}"`,
        );
        await client.query(
          `DROP FUNCTION IF EXISTS "${trigger_name}" CASCADE`,
        );
        log("info", `[SKIP] Cleaned up orphan trigger: ${trigger_name} on ${event_object_table}`);
      }
    } else {
      log("info", "[SKIP] No orphan triggers found on monitored tables");
    }
  } catch (error) {
    log("error", `[SKIP] Failed to clean up orphan triggers: ${error}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function waitForSkipService(
  controlPort: number,
  maxAttempts = 10,
  delayMs = 1000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(
        `http://localhost:${controlPort}/healthz`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (response.ok) {
        log("info", `[SKIP] Service healthy on control port ${controlPort}`);
        return;
      } else if (response.status >= 400) {
        log("warn", `[SKIP] Service responding but unhealthy (status ${response.status}), proceeding`);
        return;
      }
    } catch {
      if (i === maxAttempts - 1) {
        throw new Error(`Skip service failed to become healthy after ${maxAttempts} attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function startSkipWatchdog(streamingPort: number, controlPort: number): void {
  const WATCHDOG_INTERVAL_MS = 60_000;
  const MAX_FAILURES = 5;
  let consecutiveFailures = 0;
  let healthy = true;

  skipWatchdogInterval = setInterval(async () => {
    try {
      const [controlResult, streamingResult] = await Promise.allSettled([
        fetch(`http://localhost:${controlPort}/healthz`, {
          signal: AbortSignal.timeout(3000),
        }),
        fetch(`http://localhost:${streamingPort}/healthz`, {
          signal: AbortSignal.timeout(3000),
        }),
      ]);

      const controlOk =
        controlResult.status === "fulfilled" && controlResult.value.ok;
      const streamingOk =
        streamingResult.status === "fulfilled" && streamingResult.value.ok;

      if (controlOk && streamingOk) {
        if (!healthy) {
          log("info", `[SKIP-WATCHDOG] Skip recovered after ${consecutiveFailures} failures`);
        }
        healthy = true;
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        const details = `control=${controlOk} streaming=${streamingOk} failures=${consecutiveFailures} adapter=${postgresExternalService.isConnected()}`;

        if (healthy) {
          log("error", `[SKIP-WATCHDOG] Skip became unreachable: ${details}`);
          healthy = false;
        } else {
          log("warn", `[SKIP-WATCHDOG] Skip still unreachable: ${details}`);
        }

        if (consecutiveFailures >= MAX_FAILURES) {
          log("error", `[SKIP-WATCHDOG] ${consecutiveFailures} consecutive failures — exiting for platform restart`);
          process.exit(1);
        }
      }
    } catch (error) {
      log("error", `[SKIP-WATCHDOG] Watchdog check failed: ${error}`);
    }
  }, WATCHDOG_INTERVAL_MS);
}

async function gracefulShutdown(signal: string): Promise<void> {
  log("info", `${signal} received, shutting down gracefully...`);
  try {
    if (skipWatchdogInterval) clearInterval(skipWatchdogInterval);
    if (skipServer) {
      log("info", "Closing Skip Runtime server...");
      await skipServer.close();
    }
    log("info", "Shutting down Skip PostgreSQL adapter...");
    await postgresExternalService.shutdown();
    log("info", "Shutdown complete");
    process.exit(0);
  } catch (error) {
    log("error", `Error during shutdown: ${error}`);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export async function register() {
  const config = loadAppConfig();

  await runMigrations(join(process.cwd(), "migrations"), log);

  // Start Skip reactive service (guard against double-init in dev mode)
  if (!skipStarted) {
    skipStarted = true;
    const skipStreamingPort = parseInt(process.env.SKIP_STREAMING_PORT || "8079", 10);
    const skipControlPort = parseInt(process.env.SKIP_CONTROL_PORT || "8078", 10);

    try {
      await cleanupOrphanSkipTriggers();

      log("info", "[SKIP] Starting reactive service...");
      skipServer = await runService(skipService, {
        streaming_port: skipStreamingPort,
        control_port: skipControlPort,
        no_cors: true,
      });
      log("info", `[SKIP] runService returned (streaming: ${skipStreamingPort}, control: ${skipControlPort})`);

      await waitForSkipService(skipControlPort);
      startSkipWatchdog(skipStreamingPort, skipControlPort);
      log("info", "[SKIP] Reactive service fully started with watchdog");
    } catch (err) {
      log("error", `[SKIP] Reactive service failed to start: ${err}`);
    }
  }

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
    // Start group sync poller using the first route's auth token
    if (routes.length > 0) {
      startGroupSyncPoller(
        { graphqlUrl: config.slashwork.graphqlUrl, authToken: routes[0]!.authToken },
        log,
      );
      log("info", "Group sync: poller started (24h interval)");

      startWeeklyDigestPoller(config.slashwork.graphqlUrl, log);
      log("info", "Weekly digest: poller started (hourly check, posts Thu 2pm UTC)");
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
