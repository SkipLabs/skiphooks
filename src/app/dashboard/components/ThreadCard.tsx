"use client";

import { useState } from "react";
import type {
  SavedThread,
  QueueItemWithThread,
  QueueItemStatus,
} from "@/src/types/storage";
import CommentCard from "./CommentCard";

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontFamily: "var(--cfg-mono)",
  padding: "2px 6px",
  borderRadius: 3,
  background: "var(--cfg-accent-dim)",
  color: "var(--cfg-accent)",
};

const tagStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontFamily: "var(--cfg-mono)",
  padding: "1px 5px",
  borderRadius: 2,
  background: "var(--cfg-border)",
  color: "var(--cfg-text-muted)",
};

export default function ThreadCard({
  thread,
  items,
  onStatusChange,
  onNotesChange,
}: {
  thread: SavedThread;
  items: QueueItemWithThread[];
  onStatusChange: (id: string, status: QueueItemStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const scorePercent = Math.round(thread.relevanceScore * 100);

  return (
    <div
      style={{
        background: "var(--cfg-surface)",
        border: "1px solid var(--cfg-border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {/* Thread header */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            color: "var(--cfg-text-dim)",
            fontSize: 14,
            fontFamily: "var(--cfg-mono)",
            userSelect: "none",
            lineHeight: "20px",
          }}
        >
          {expanded ? "\u25BC" : "\u25B6"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <a
              href={thread.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: "var(--cfg-text)",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: "20px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--cfg-accent)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--cfg-text)")
              }
            >
              {thread.title}
            </a>
            <span style={badgeStyle}>r/{thread.subreddit}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {/* Score bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 4,
                  background: "var(--cfg-border)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${scorePercent}%`,
                    height: "100%",
                    background:
                      scorePercent >= 70
                        ? "var(--cfg-green)"
                        : scorePercent >= 40
                          ? "var(--cfg-amber)"
                          : "var(--cfg-text-dim)",
                    borderRadius: 2,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--cfg-mono)",
                  color: "var(--cfg-text-muted)",
                }}
              >
                {scorePercent}%
              </span>
            </div>

            {/* Topic tags */}
            {thread.suggestedTopics.map((topic) => (
              <span key={topic} style={tagStyle}>
                {topic}
              </span>
            ))}

            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--cfg-mono)",
                color: "var(--cfg-text-dim)",
                marginLeft: "auto",
              }}
            >
              {items.length} comment{items.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Comment cards */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--cfg-border-subtle)",
            padding: "4px 0",
          }}
        >
          {items.map((item) => (
            <CommentCard
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              onNotesChange={onNotesChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
