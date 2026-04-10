export interface SkipStreamEntry<T> {
  key: string;
  values: T[];
}

/** Extract items from Skip's [key, [value, ...]] format */
export function parseSkipEntries<T>(values: [string, T[]][]): T[] {
  return values.flatMap(([_key, vals]) => vals);
}

/** Apply incremental updates to local state using the Skip stream key */
export function applySkipUpdates<T>(
  current: Map<string, T>,
  updates: [string, T[]][],
): Map<string, T> {
  const map = new Map(current);
  for (const [key, vals] of updates) {
    if (vals.length === 0) {
      map.delete(key);
    } else {
      map.set(key, vals[0]!);
    }
  }
  return map;
}
