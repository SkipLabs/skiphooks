import { test, expect, describe } from "bun:test";
import { computeDigestWindow } from "./weekly-digest";

// June 11, 2026 is Thursday (confirmed: June 15, 2026 is Monday)
const THURSDAY = "2026-06-11";
const PREV_THURSDAY = "2026-06-04";
const PREV_PREV_THURSDAY = "2026-05-28";

describe("computeDigestWindow", () => {
  test("on Thursday at exactly 14:00 UTC, window ends at this Thursday 14:00", () => {
    const now = new Date(`${THURSDAY}T14:00:00.000Z`);
    const { start, end } = computeDigestWindow(now);
    expect(end).toBe(`${THURSDAY}T14:00:00.000Z`);
    expect(start).toBe(`${PREV_THURSDAY}T14:00:00.000Z`);
  });

  test("on Thursday before 14:00 UTC, window ends at the previous Thursday 14:00", () => {
    const now = new Date(`${THURSDAY}T13:59:00.000Z`);
    const { start, end } = computeDigestWindow(now);
    expect(end).toBe(`${PREV_THURSDAY}T14:00:00.000Z`);
    expect(start).toBe(`${PREV_PREV_THURSDAY}T14:00:00.000Z`);
  });

  test("on a Monday, window ends at the previous Thursday 14:00", () => {
    // Monday, June 15, 2026
    const now = new Date("2026-06-15T10:00:00.000Z");
    const { start, end } = computeDigestWindow(now);
    expect(end).toBe(`${THURSDAY}T14:00:00.000Z`);
    expect(start).toBe(`${PREV_THURSDAY}T14:00:00.000Z`);
  });

  test("window is exactly 7 days", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    const { start, end } = computeDigestWindow(now);
    const diff = new Date(end).getTime() - new Date(start).getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("label contains human-readable UTC range with 'to'", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    const { label } = computeDigestWindow(now);
    expect(label).toContain("UTC");
    expect(label).toContain(" to ");
  });

  test("on Sunday, window ends at the most recent Thursday 14:00", () => {
    // Sunday, June 14, 2026
    const now = new Date("2026-06-14T20:00:00.000Z");
    const { end } = computeDigestWindow(now);
    expect(end).toBe(`${THURSDAY}T14:00:00.000Z`);
  });
});
