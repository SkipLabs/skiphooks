export const MAX_RECONNECT_DELAY_MS = 30000;

/** Exponential backoff (1s, 2s, 4s, …) capped at MAX_RECONNECT_DELAY_MS. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}
