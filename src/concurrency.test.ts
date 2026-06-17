import { test, expect } from "bun:test";
import { mapWithConcurrency } from "./concurrency";

test("mapWithConcurrency preserves order and returns settled results", async () => {
  const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
  expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([
    10, 20, 30, 40,
  ]);
});

test("mapWithConcurrency isolates rejections per item", async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom");
    return n;
  });
  expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
  expect(results[1]!.status).toBe("rejected");
  expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
});

test("mapWithConcurrency never exceeds the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  expect(peak).toBeLessThanOrEqual(3);
});

test("mapWithConcurrency handles an empty list", async () => {
  expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
});
