import { getAccessToken } from "./auth.ts";
import { fetchUpcomingEvents } from "./fetch-events.ts";
import { formatCalendarReminder, isAllDayEvent, isCancelledEvent } from "./format.ts";
import { postToSlashwork, type SlashworkConnection } from "../slashwork.ts";
import type { CalendarConfig } from "../config.ts";

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

    for (const user of calendarConfig.users) {
      try {
        const events = await fetchUpcomingEvents(
          accessToken,
          user.calendarId,
          now,
          timeMax,
        );

        for (const event of events) {
          if (isCancelledEvent(event)) continue;
          if (isAllDayEvent(event)) continue;

          const startTime = event.start.dateTime!;
          const key = eventKey(user.calendarId, event.id, startTime);
          if (remindedKeys.has(key)) continue;

          const minutesUntilStart =
            (new Date(startTime).getTime() - now.getTime()) / 60_000;

          const { markdown } = formatCalendarReminder(
            event,
            user.name,
            minutesUntilStart,
          );

          try {
            await postToSlashwork(connection, user.targetId, markdown);
            remindedKeys.add(key);
            log("info", `Calendar reminder for ${user.name}: "${event.summary}"`);
          } catch (err) {
            log("error", `Failed to post calendar reminder for ${user.name}: ${err}`);
          }
        }
      } catch (err) {
        log("error", `Failed to fetch calendar for ${user.name}: ${err}`);
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
