"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { applySkipUpdates } from "./parse-stream";

type StreamName = "authTokens" | "groups" | "routes" | "discoveredGroups";

interface StreamState<T> {
  items: Map<string, T>;
  connected: boolean;
}

interface SkipStreamsContextValue {
  subscribe: <T>(
    name: StreamName,
    initialData: Map<string, T>,
    onUpdate: (items: Map<string, T>, connected: boolean) => void,
  ) => () => void;
}

const SkipStreamsContext = createContext<SkipStreamsContextValue | null>(null);

interface StreamEntry {
  eventSource: EventSource | null;
  subscribers: Set<(items: Map<string, unknown>, connected: boolean) => void>;
  items: Map<string, unknown>;
  connected: boolean;
}

export function SkipStreamsProvider({ children }: { children: React.ReactNode }) {
  const streamsRef = useRef<Map<StreamName, StreamEntry>>(new Map());
  const urlsRef = useRef<Record<string, string> | null>(null);
  const fetchingRef = useRef(false);
  const pendingRef = useRef<Array<() => void>>([]);

  const ensureUrls = useCallback(async () => {
    if (urlsRef.current) return urlsRef.current;
    if (fetchingRef.current) {
      return new Promise<Record<string, string>>((resolve) => {
        pendingRef.current.push(() => resolve(urlsRef.current!));
      });
    }

    fetchingRef.current = true;
    try {
      const res = await fetch("/api/skip/batch");
      if (!res.ok) throw new Error("Failed to fetch stream URLs");
      const { streams } = await res.json();
      urlsRef.current = streams;
      pendingRef.current.forEach((cb) => cb());
      pendingRef.current = [];
      return streams as Record<string, string>;
    } catch {
      fetchingRef.current = false;
      throw new Error("Failed to fetch stream URLs");
    }
  }, []);

  const connectStream = useCallback((name: StreamName, streamUrl: string, entry: StreamEntry) => {
    const es = new EventSource(streamUrl);

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      if (!Array.isArray(data.values)) return;
      const map = new Map<string, unknown>();
      for (const [key, vals] of data.values as [string, unknown[]][]) {
        if (vals.length > 0) map.set(key, vals[0]!);
      }
      entry.items = map;
      entry.connected = true;
      entry.subscribers.forEach((cb) => cb(map, true));
    });

    es.addEventListener("update", (e) => {
      const data = JSON.parse(e.data);
      if (!Array.isArray(data.values)) return;
      entry.items = applySkipUpdates(entry.items, data.values);
      entry.subscribers.forEach((cb) => cb(entry.items, entry.connected));
    });

    es.onerror = () => {
      entry.connected = false;
      entry.subscribers.forEach((cb) => cb(entry.items, false));
      es.close();
      entry.eventSource = null;
      // Reconnect if there are still subscribers
      if (entry.subscribers.size > 0) {
        setTimeout(() => {
          if (entry.subscribers.size > 0) {
            connectStream(name, streamUrl, entry);
          }
        }, 5000);
      }
    };

    entry.eventSource = es;
  }, []);

  const subscribe = useCallback(<T,>(
    name: StreamName,
    initialData: Map<string, T>,
    onUpdate: (items: Map<string, T>, connected: boolean) => void,
  ) => {
    let entry = streamsRef.current.get(name);
    const typedCallback = onUpdate as (items: Map<string, unknown>, connected: boolean) => void;

    if (!entry) {
      entry = {
        eventSource: null,
        subscribers: new Set(),
        items: initialData as Map<string, unknown>,
        connected: false,
      };
      streamsRef.current.set(name, entry);

      // Start connection
      ensureUrls().then((urls) => {
        const url = urls[name];
        if (url && entry!.subscribers.size > 0) {
          connectStream(name, url, entry!);
        }
      }).catch(() => {
        // Will retry on next subscribe
      });
    } else {
      // Send current state to new subscriber
      onUpdate(entry.items as Map<string, T>, entry.connected);
    }

    entry.subscribers.add(typedCallback);

    return () => {
      entry!.subscribers.delete(typedCallback);
      if (entry!.subscribers.size === 0) {
        entry!.eventSource?.close();
        entry!.eventSource = null;
        streamsRef.current.delete(name);
      }
    };
  }, [ensureUrls, connectStream]);

  return (
    <SkipStreamsContext.Provider value={{ subscribe }}>
      {children}
    </SkipStreamsContext.Provider>
  );
}

export function useSkipStream<T>(
  name: StreamName,
  initialData: Map<string, T>,
): { items: Map<string, T>; connected: boolean } {
  const ctx = useContext(SkipStreamsContext);
  const [state, setState] = useState<StreamState<T>>({
    items: initialData,
    connected: false,
  });

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe<T>(name, initialData, (items, connected) => {
      setState({ items, connected });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, name]);

  return state;
}
