import type { FormattedEvent } from "../handlers/types.ts";
import type { CalendarEvent } from "./types.ts";

const MAX_DESCRIPTION_LENGTH = 200;

function getVideoLink(event: CalendarEvent): string | undefined {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  return videoEntry?.uri;
}

function formatTime(dateTimeStr: string): string {
  const date = new Date(dateTimeStr);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatCalendarReminder(
  event: CalendarEvent,
  calendarName: string,
  minutesUntilStart: number,
): FormattedEvent {
  const title = event.summary || "(No title)";
  const startTime = event.start.dateTime
    ? formatTime(event.start.dateTime)
    : "All day";

  const urgency =
    minutesUntilStart <= 1
      ? "starting now"
      : `in ${Math.round(minutesUntilStart)} min`;

  const videoLink = getVideoLink(event);
  const lines: string[] = [];

  // Header with video link if available
  if (videoLink) {
    lines.push(`**[${title}](${videoLink})** — ${urgency}`);
  } else if (event.htmlLink) {
    lines.push(`**[${title}](${event.htmlLink})** — ${urgency}`);
  } else {
    lines.push(`**${title}** — ${urgency}`);
  }

  // Time + calendar
  lines.push(`${startTime} · ${calendarName}`);

  // Location
  if (event.location) {
    lines.push(`Location: ${event.location}`);
  }

  // Description
  if (event.description) {
    const cleaned = event.description.replace(/<[^>]*>/g, "").trim();
    if (cleaned.length > 0) {
      const truncated =
        cleaned.length > MAX_DESCRIPTION_LENGTH
          ? cleaned.slice(0, MAX_DESCRIPTION_LENGTH) + "…"
          : cleaned;
      lines.push(`> ${truncated}`);
    }
  }

  return { markdown: lines.join("\n") };
}

export function isAllDayEvent(event: CalendarEvent): boolean {
  return !event.start.dateTime && !!event.start.date;
}

export function isCancelledEvent(event: CalendarEvent): boolean {
  return event.status === "cancelled";
}
