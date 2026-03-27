export interface SkipStreamEntry<T> {
  key: string;
  values: T[];
}

/** Extract items from Skip's [key, [value, ...]] format */
export function parseSkipEntries<T>(values: [string, T[]][]): T[] {
  return values.flatMap(([_key, vals]) => vals);
}

/** Apply incremental updates to local state keyed by slashwork_id */
export function applySkipUpdates<T extends { slashwork_id: string }>(
  current: T[],
  updates: [string, T[]][],
): T[] {
  const map = new Map(current.map((item) => [item.slashwork_id, item]));
  for (const [key, vals] of updates) {
    if (vals.length === 0) {
      map.delete(key);
    } else {
      map.set(key, vals[0]!);
    }
  }
  return Array.from(map.values());
}
