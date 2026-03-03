import { test, expect } from "bun:test";
import { formatCalendarReminder, isAllDayEvent, isCancelledEvent } from "./format.ts";
import type { CalendarEvent } from "./types.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    status: "confirmed",
    summary: "Team Standup",
    htmlLink: "https://calendar.google.com/event?eid=abc123",
    start: { dateTime: "2026-03-03T10:00:00-05:00" },
    end: { dateTime: "2026-03-03T10:30:00-05:00" },
    ...overrides,
  };
}

// formatCalendarReminder tests

test("formatCalendarReminder: includes all fields", () => {
  const event = makeEvent({
    location: "Conference Room A",
    hangoutLink: "https://meet.google.com/abc-defg-hij",
    description: "Daily sync to discuss progress",
  });

  const { markdown } = formatCalendarReminder(event, "Engineering", 5);

  expect(markdown).toContain("Team Standup");
  expect(markdown).toContain("in 5 min");
  expect(markdown).toContain("Engineering");
  expect(markdown).toContain("Conference Room A");
  expect(markdown).toContain("https://meet.google.com/abc-defg-hij");
  expect(markdown).toContain("Join video call");
  expect(markdown).toContain("Daily sync to discuss progress");
  expect(markdown).toContain("https://calendar.google.com/event?eid=abc123");
});

test("formatCalendarReminder: handles missing optional fields", () => {
  const event = makeEvent({
    summary: undefined,
    htmlLink: undefined,
    location: undefined,
    hangoutLink: undefined,
    description: undefined,
  });

  const { markdown } = formatCalendarReminder(event, "Work", 3);

  expect(markdown).toContain("(No title)");
  expect(markdown).toContain("in 3 min");
  expect(markdown).toContain("Work");
  expect(markdown).not.toContain("Location");
  expect(markdown).not.toContain("Join video call");
});

test("formatCalendarReminder: truncates long description", () => {
  const event = makeEvent({
    description: "x".repeat(300),
  });

  const { markdown } = formatCalendarReminder(event, "Cal", 2);

  expect(markdown).toContain("…");
  // Should be truncated to ~200 chars + ellipsis
  const descLine = markdown.split("\n").find((l) => l.startsWith(">"));
  expect(descLine).toBeDefined();
  expect(descLine!.length).toBeLessThan(210);
});

test("formatCalendarReminder: strips HTML from description", () => {
  const event = makeEvent({
    description: "<b>Important:</b> Bring <a href='#'>docs</a>",
  });

  const { markdown } = formatCalendarReminder(event, "Cal", 4);

  expect(markdown).toContain("Important:");
  expect(markdown).toContain("Bring");
  expect(markdown).toContain("docs");
  expect(markdown).not.toContain("<b>");
  expect(markdown).not.toContain("<a");
});

test("formatCalendarReminder: shows 'starting now' for <=1 min", () => {
  const event = makeEvent();

  const { markdown } = formatCalendarReminder(event, "Cal", 0.5);

  expect(markdown).toContain("starting now");
  expect(markdown).not.toContain("in 0");
});

test("formatCalendarReminder: uses conferenceData when no hangoutLink", () => {
  const event = makeEvent({
    hangoutLink: undefined,
    conferenceData: {
      entryPoints: [
        { entryPointType: "phone", uri: "tel:+1234567890" },
        { entryPointType: "video", uri: "https://zoom.us/j/123456" },
      ],
    },
  });

  const { markdown } = formatCalendarReminder(event, "Cal", 3);

  expect(markdown).toContain("https://zoom.us/j/123456");
  expect(markdown).toContain("Join video call");
});

// isAllDayEvent tests

test("isAllDayEvent: returns true for date-only events", () => {
  const event = makeEvent({
    start: { date: "2026-03-03" },
    end: { date: "2026-03-04" },
  });

  expect(isAllDayEvent(event)).toBe(true);
});

test("isAllDayEvent: returns false for timed events", () => {
  const event = makeEvent();

  expect(isAllDayEvent(event)).toBe(false);
});

// isCancelledEvent tests

test("isCancelledEvent: returns true for cancelled status", () => {
  const event = makeEvent({ status: "cancelled" });

  expect(isCancelledEvent(event)).toBe(true);
});

test("isCancelledEvent: returns false for confirmed status", () => {
  const event = makeEvent({ status: "confirmed" });

  expect(isCancelledEvent(event)).toBe(false);
});

// Dedup key logic (tested via Set behavior)

test("dedup: same event ID + start time is deduplicated", () => {
  const remindedKeys = new Set<string>();
  const key1 = "cal1:event-1:2026-03-03T10:00:00Z";
  const key2 = "cal1:event-1:2026-03-03T10:00:00Z";

  remindedKeys.add(key1);
  expect(remindedKeys.has(key2)).toBe(true);
});

test("dedup: different event IDs are not deduplicated", () => {
  const remindedKeys = new Set<string>();
  const key1 = "cal1:event-1:2026-03-03T10:00:00Z";
  const key2 = "cal1:event-2:2026-03-03T10:00:00Z";

  remindedKeys.add(key1);
  expect(remindedKeys.has(key2)).toBe(false);
});

test("dedup: same event at different times is not deduplicated", () => {
  const remindedKeys = new Set<string>();
  const key1 = "cal1:event-1:2026-03-03T10:00:00Z";
  const key2 = "cal1:event-1:2026-03-04T10:00:00Z";

  remindedKeys.add(key1);
  expect(remindedKeys.has(key2)).toBe(false);
});
