import { test, expect, describe } from "bun:test";
import { reconnectDelay, MAX_RECONNECT_DELAY_MS } from "./backoff";

describe("reconnectDelay", () => {
  test("grows exponentially from 1s", () => {
    expect(reconnectDelay(0)).toBe(1000);
    expect(reconnectDelay(1)).toBe(2000);
    expect(reconnectDelay(2)).toBe(4000);
    expect(reconnectDelay(3)).toBe(8000);
    expect(reconnectDelay(4)).toBe(16000);
  });

  test("caps at MAX_RECONNECT_DELAY_MS", () => {
    expect(reconnectDelay(5)).toBe(MAX_RECONNECT_DELAY_MS);
    expect(reconnectDelay(10)).toBe(MAX_RECONNECT_DELAY_MS);
    expect(reconnectDelay(100)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  test("never exceeds the cap and is monotonic up to it", () => {
    let prev = 0;
    for (let i = 0; i < 20; i++) {
      const d = reconnectDelay(i);
      expect(d).toBeLessThanOrEqual(MAX_RECONNECT_DELAY_MS);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
