import { getAccessToken } from "./auth";
import { fetchUpcomingEvents } from "./fetch-events";
import { formatCalendarReminder, isAllDayEvent, isCancelledEvent } from "./format";
import { postToSlashwork, type SlashworkConnection } from "../slashwork";
import type { CalendarConfig } from "../config";

export interface PollerState {
  interval: ReturnType<typeof setInterval>;
  remindedKeys: Set<string>;
  cleanupInterval: ReturnType<typeof setInterval>;
}

function eventKey(calendarId: string, eventId: string, startTime: string): string {
  return `${calendarId}:${eventId}:${startTime}`;
}

type LogFn = (level: string, message: string) => void;

export function startCalendarPoller(
  calendarConfig: CalendarConfig,
  graphqlUrl: string,
  log: LogFn,
): PollerState {
  const remindedKeys = new Set<string>();
  const pollIntervalMs = calendarConfig.pollIntervalMs ?? 60_000;
  const reminderLeadTimeMs = calendarConfig.reminderLeadTimeMs ?? 300_000;

  const connection: SlashworkConnection = {
    graphqlUrl,
    authToken: calendarConfig.authToken,
  };

  async function poll() {
    let accessToken: string;
    try {
      accessToken = await getAccessToken(calendarConfig.serviceAccountKey);
    } catch (err) {
      log("error", `Calendar auth failed: ${err}`);
      return;
    }

    const now = new Date();
    const timeMax = new Date(now.getTime() + reminderLeadTimeMs);

    // Poll every user's calendar concurrently — they share one access token
    // and write to disjoint dedup keys (keyed by calendarId), so there's no
    // cross-user contention. Sequential polling made latency scale with the
    // number of users.
    await Promise.allSettled(
      calendarConfig.users.map((user) => pollUser(user, accessToken, now, timeMax)),
    );
  }

  async function pollUser(
    user: CalendarConfig["users"][number],
    accessToken: string,
    now: Date,
    timeMax: Date,
  ): Promise<void> {
    let events;
    try {
      events = await fetchUpcomingEvents(accessToken, user.calendarId, now, timeMax);
    } catch (err) {
      log("error", `Failed to fetch calendar for ${user.name}: ${err}`);
      return;
    }

    for (const event of events) {
      if (isCancelledEvent(event)) continue;
      if (isAllDayEvent(event)) continue;

      const startTime = event.start.dateTime!;
      const key = eventKey(user.calendarId, event.id, startTime);
      if (remindedKeys.has(key)) continue;

      const minutesUntilStart =
        (new Date(startTime).getTime() - now.getTime()) / 60_000;

      const { markdown } = formatCalendarReminder(event, user.name, minutesUntilStart);

      try {
        await postToSlashwork(connection, user.targetId, markdown);
        remindedKeys.add(key);
        log("info", `Calendar reminder for ${user.name}: "${event.summary}"`);
      } catch (err) {
        log("error", `Failed to post calendar reminder for ${user.name}: ${err}`);
      }
    }
  }

  // Run first poll immediately
  poll();

  const interval = setInterval(poll, pollIntervalMs);

  // Cleanup old dedup entries every hour
  const cleanupInterval = setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 3600_000);
    for (const key of remindedKeys) {
      const lastColon = key.lastIndexOf(":");
      const startTimeStr = key.slice(lastColon + 1);
      const startTime = new Date(startTimeStr);
      if (!isNaN(startTime.getTime()) && startTime < oneHourAgo) {
        remindedKeys.delete(key);
      }
    }
  }, 3600_000);

  log("info", `Calendar poller started (interval: ${pollIntervalMs}ms, lead time: ${reminderLeadTimeMs}ms)`);
  log("info", `Watching calendars for: ${calendarConfig.users.map((u) => u.name).join(", ")}`);

  return { interval, remindedKeys, cleanupInterval };
}

export function stopCalendarPoller(state: PollerState): void {
  clearInterval(state.interval);
  clearInterval(state.cleanupInterval);
}
