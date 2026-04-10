"use client";

import { useEffect, useState } from "react";
import { applySkipUpdates } from "./parse-stream";

/**
 * Generic hook to subscribe to a Skip reactive stream.
 * @param apiUrl - The API endpoint that returns { streamUrl } (e.g. "/api/skip/auth-tokens")
 * @param initialData - Initial Map<key, T> from server-rendered data
 */
export function useSkipStream<T>(
  apiUrl: string,
  initialData: Map<string, T>,
): { items: Map<string, T>; connected: boolean } {
  const [items, setItems] = useState(initialData);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;

      try {
        const res = await fetch(apiUrl);
        if (!res.ok || cancelled) return;
        const { streamUrl } = await res.json();

        if (cancelled) return;
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener("init", (e) => {
          const data = JSON.parse(e.data);
          if (!Array.isArray(data.values)) return;
          const map = new Map<string, T>();
          for (const [key, vals] of data.values as [string, T[]][]) {
            if (vals.length > 0) map.set(key, vals[0]!);
          }
          setItems(map);
          setConnected(true);
        });

        eventSource.addEventListener("update", (e) => {
          const data = JSON.parse(e.data);
          if (!Array.isArray(data.values)) return;
          setItems((prev) => applySkipUpdates(prev, data.values));
        });

        eventSource.onerror = () => {
          setConnected(false);
          eventSource?.close();
          eventSource = null;
          if (!cancelled) {
            setTimeout(connect, 5000);
          }
        };
      } catch {
        if (!cancelled) {
          setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [apiUrl]);

  return { items, connected };
}
