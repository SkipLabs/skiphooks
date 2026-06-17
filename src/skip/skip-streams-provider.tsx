"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { applySkipUpdates } from "./parse-stream";

type StreamName = "authTokens" | "groups" | "routes";

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
  reconnectAttempts: number;
}

const MAX_RECONNECT_DELAY_MS = 30000;

function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

export function SkipStreamsProvider({ children }: { children: React.ReactNode }) {
  const streamsRef = useRef<Map<StreamName, StreamEntry>>(new Map());
  const urlsRef = useRef<Record<string, string> | null>(null);
  const fetchingRef = useRef(false);
  const pendingRef = useRef<
    Array<{
      resolve: (urls: Record<string, string>) => void;
      reject: (err: Error) => void;
    }>
  >([]);

  const ensureUrls = useCallback(async () => {
    if (urlsRef.current) return urlsRef.current;
    if (fetchingRef.current) {
      return new Promise<Record<string, string>>((resolve, reject) => {
        pendingRef.current.push({ resolve, reject });
      });
    }

    fetchingRef.current = true;
    try {
      const res = await fetch("/api/skip/batch");
      if (!res.ok) throw new Error("Failed to fetch stream URLs");
      const { streams } = await res.json();
      urlsRef.current = streams;
      const waiters = pendingRef.current;
      pendingRef.current = [];
      waiters.forEach((w) => w.resolve(streams));
      return streams as Record<string, string>;
    } catch (err) {
      // Reject every queued waiter — otherwise subscribers that arrived
      // while this fetch was in flight hang forever on an unsettled promise.
      const error = err instanceof Error ? err : new Error("Failed to fetch stream URLs");
      const waiters = pendingRef.current;
      pendingRef.current = [];
      waiters.forEach((w) => w.reject(error));
      throw error;
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const connectStream = useCallback((name: StreamName, entry: StreamEntry) => {
    const retry = () => {
      if (entry.subscribers.size === 0) return;
      const delay = reconnectDelay(entry.reconnectAttempts++);
      setTimeout(() => {
        if (entry.subscribers.size > 0) connectStream(name, entry);
      }, delay);
    };

    // Stream UUIDs are single-use — the proxy deletes them on disconnect — so
    // each (re)connect must fetch a fresh URL rather than reuse a dead one.
    ensureUrls()
      .then((urls) => {
        const url = urls[name];
        if (!url || entry.subscribers.size === 0) return;

        const es = new EventSource(url);

        es.onopen = () => {
          entry.reconnectAttempts = 0;
        };

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
          // The cached URL is now dead — invalidate so retry fetches a fresh one.
          urlsRef.current = null;
          retry();
        };

        entry.eventSource = es;
      })
      .catch(retry);
  }, [ensureUrls]);

  const subscribe = useCallback(<T,>(
    name: StreamName,
    initialData: Map<string, T>,
    onUpdate: (items: Map<string, T>, connected: boolean) => void,
  ) => {
    let entry = streamsRef.current.get(name);
    const typedCallback = onUpdate as (items: Map<string, unknown>, connected: boolean) => void;
    const isNew = !entry;

    if (!entry) {
      entry = {
        eventSource: null,
        subscribers: new Set(),
        items: initialData as Map<string, unknown>,
        connected: false,
        reconnectAttempts: 0,
      };
      streamsRef.current.set(name, entry);
    } else {
      // Send current state to new subscriber
      onUpdate(entry.items as Map<string, T>, entry.connected);
    }

    entry.subscribers.add(typedCallback);

    // Connect only after the subscriber is registered, so connectStream's
    // "no subscribers" guard doesn't bail on the very first subscribe.
    if (isNew) connectStream(name, entry);

    return () => {
      entry!.subscribers.delete(typedCallback);
      if (entry!.subscribers.size === 0) {
        entry!.eventSource?.close();
        entry!.eventSource = null;
        streamsRef.current.delete(name);
      }
    };
  }, [connectStream]);

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
