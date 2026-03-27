"use client";

import { useEffect, useState } from "react";
import { parseSkipEntries, applySkipUpdates } from "@/src/skip/parse-stream";

interface DbSlashworkGroup {
  slashwork_id: string;
  name: string;
  discovered_at: string;
  last_seen_at: string;
}

interface DiscoveredGroup {
  slashworkId: string;
  name: string;
  discoveredAt: string;
  lastSeenAt: string;
}

function dbToGroup(row: DbSlashworkGroup): DiscoveredGroup {
  return {
    slashworkId: row.slashwork_id,
    name: row.name,
    discoveredAt: row.discovered_at,
    lastSeenAt: row.last_seen_at,
  };
}

export default function DiscoveredGroupsLive({
  initialGroups,
  configuredGroupIds,
}: {
  initialGroups: DiscoveredGroup[];
  configuredGroupIds: string[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;

      try {
        const res = await fetch("/api/skip/discovered-groups");
        if (!res.ok || cancelled) return;
        const { streamUrl } = await res.json();

        if (cancelled) return;
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener("init", (e) => {
          const data = JSON.parse(e.data);
          const dbRows: DbSlashworkGroup[] = parseSkipEntries(data.values);
          setGroups(dbRows.map(dbToGroup));
          setConnected(true);
        });

        eventSource.addEventListener("update", (e) => {
          const data = JSON.parse(e.data);
          setGroups((prev) => {
            const dbCurrent = prev.map((g) => ({
              slashwork_id: g.slashworkId,
              name: g.name,
              discovered_at: g.discoveredAt,
              last_seen_at: g.lastSeenAt,
            }));
            const updated = applySkipUpdates(dbCurrent, data.values);
            return updated.map(dbToGroup);
          });
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
  }, []);

  const configuredSet = new Set(configuredGroupIds);

  return (
    <div className="sw-section sw-section--wide">
      <div className="sw-section-header">
        <h2 className="sw-section-title">
          Slashwork Groups (discovered)
          {connected && (
            <span className="sw-badge sw-badge--group" style={{ marginLeft: "8px", fontSize: "0.7em" }}>
              live
            </span>
          )}
        </h2>
        <span className="sw-count">{groups.length}</span>
      </div>
      <table className="sw-table" aria-label="Discovered Slashwork groups">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Slashwork ID</th>
            <th scope="col">First Seen</th>
            <th scope="col">Last Seen</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={5} className="sw-empty">
                No groups discovered yet — sync runs on startup and every 24h
              </td>
            </tr>
          ) : (
            groups.map((g) => {
              const configured = configuredSet.has(g.slashworkId);
              return (
                <tr key={g.slashworkId}>
                  <td>{g.name || <span className="sw-muted">unnamed</span>}</td>
                  <td className="sw-mono">{g.slashworkId}</td>
                  <td className="sw-mono">
                    {new Date(g.discoveredAt).toLocaleDateString()}
                  </td>
                  <td className="sw-mono">
                    {new Date(g.lastSeenAt).toLocaleDateString()}
                  </td>
                  <td>
                    {configured ? (
                      <span className="sw-badge sw-badge--group">configured</span>
                    ) : (
                      <span className="sw-badge sw-badge--stream">unlinked</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
