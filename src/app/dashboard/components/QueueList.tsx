"use client";

import { useState, useCallback } from "react";
import type {
  QueueItemWithThread,
  QueueItemStatus,
} from "@/src/types/storage";
import ThreadCard from "./ThreadCard";

export default function QueueList({
  initialItems,
}: {
  initialItems: QueueItemWithThread[];
}) {
  const [items, setItems] = useState(initialItems);

  const updateItemStatus = useCallback(
    async (id: string, status: QueueItemStatus) => {
      // Capture previous state for rollback
      const previousItem = items.find((item) => item.id === id);

      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                repliedAt: status === "replied" ? new Date() : item.repliedAt,
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/queue/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok && previousItem) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, status: previousItem.status, repliedAt: previousItem.repliedAt }
                : item
            )
          );
        }
      } catch {
        if (previousItem) {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, status: previousItem.status, repliedAt: previousItem.repliedAt }
                : item
            )
          );
        }
      }
    },
    [items]
  );

  const updateItemNotes = useCallback(async (id: string, notes: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notes } : item))
    );

    try {
      await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } catch {
      // Notes save is best-effort
    }
  }, []);

  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px 20px",
          color: "var(--cfg-text-muted)",
          fontFamily: "var(--cfg-mono)",
          fontSize: 14,
        }}
      >
        No items in queue. Run the pipeline to scan Reddit.
      </div>
    );
  }

  // Group items by thread
  const grouped = new Map<string, QueueItemWithThread[]>();
  for (const item of items) {
    const threadId = item.threadId;
    const group = grouped.get(threadId);
    if (group) {
      group.push(item);
    } else {
      grouped.set(threadId, [item]);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Array.from(grouped.entries()).map(([threadId, threadItems]) => (
        <ThreadCard
          key={threadId}
          thread={threadItems[0]!.thread}
          items={threadItems}
          onStatusChange={updateItemStatus}
          onNotesChange={updateItemNotes}
        />
      ))}
    </div>
  );
}
