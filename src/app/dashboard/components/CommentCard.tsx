"use client";

import { useState, useRef } from "react";
import type { QueueItemWithThread, QueueItemStatus } from "@/src/types/storage";

const urgencyColors: Record<string, { bg: string; fg: string }> = {
  high: { bg: "rgba(239, 68, 68, 0.12)", fg: "#ef4444" },
  medium: { bg: "var(--cfg-amber-dim)", fg: "var(--cfg-amber)" },
  low: { bg: "var(--cfg-border)", fg: "var(--cfg-text-dim)" },
};

const statusLabels: Record<QueueItemStatus, string> = {
  pending: "Pending",
  replied: "Replied",
  dismissed: "Dismissed",
  snoozed: "Snoozed",
};

const actionBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--cfg-border)",
  borderRadius: 3,
  color: "var(--cfg-text-muted)",
  fontSize: 11,
  fontFamily: "var(--cfg-mono)",
  padding: "3px 8px",
  cursor: "pointer",
};

export default function CommentCard({
  item,
  onStatusChange,
  onNotesChange,
}: {
  item: QueueItemWithThread;
  onStatusChange: (id: string, status: QueueItemStatus) => void;
  onNotesChange: (id: string, notes: string) => void;
}) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const urgency = urgencyColors[item.urgency]!;
  const bodyPreview =
    item.commentBody.length > 200 && !bodyExpanded
      ? item.commentBody.slice(0, 200) + "..."
      : item.commentBody;

  const isDone = item.status === "replied" || item.status === "dismissed";

  return (
    <div
      style={{
        padding: "12px 16px 12px 44px",
        borderBottom: "1px solid var(--cfg-border-subtle)",
        opacity: isDone ? 0.5 : 1,
      }}
    >
      {/* Meta row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          flexWrap: "wrap",
          fontSize: 11,
          fontFamily: "var(--cfg-mono)",
        }}
      >
        <span style={{ color: "var(--cfg-text-muted)" }}>u/{item.author}</span>
        <span style={{ color: "var(--cfg-text-dim)" }}>
          {item.upvotes} pts
        </span>
        {item.depth > 0 && (
          <span style={{ color: "var(--cfg-text-dim)" }}>
            depth {item.depth}
          </span>
        )}
        <span
          style={{
            display: "inline-block",
            padding: "1px 5px",
            borderRadius: 2,
            fontSize: 10,
            background: urgency.bg,
            color: urgency.fg,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {item.urgency}
        </span>
        {item.status !== "pending" && (
          <span
            style={{
              display: "inline-block",
              padding: "1px 5px",
              borderRadius: 2,
              fontSize: 10,
              background: "var(--cfg-border)",
              color: "var(--cfg-text-dim)",
            }}
          >
            {statusLabels[item.status]}
          </span>
        )}
      </div>

      {/* Comment body */}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--cfg-text)",
          marginBottom: 8,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          cursor: item.commentBody.length > 200 ? "pointer" : "default",
        }}
        onClick={() => {
          if (item.commentBody.length > 200) setBodyExpanded(!bodyExpanded);
        }}
      >
        {bodyPreview}
      </div>

      {/* Reply angle */}
      {item.replyAngle && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "var(--cfg-mono)",
            color: "var(--cfg-green)",
            background: "var(--cfg-green-dim)",
            padding: "4px 8px",
            borderRadius: 3,
            marginBottom: 8,
          }}
        >
          Angle: {item.replyAngle}
        </div>
      )}

      {/* Notes */}
      {item.notes && !showNoteInput && (
        <div
          style={{
            fontSize: 12,
            color: "var(--cfg-text-muted)",
            fontStyle: "italic",
            marginBottom: 8,
          }}
        >
          Note: {item.notes}
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <a
          href={item.commentUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...actionBtnStyle,
            textDecoration: "none",
            color: "var(--cfg-accent)",
            borderColor: "var(--cfg-accent)",
          }}
        >
          View on Reddit
        </a>
        {item.status !== "replied" && (
          <button
            style={{
              ...actionBtnStyle,
              color: "var(--cfg-green)",
              borderColor: "var(--cfg-green)",
            }}
            onClick={() => onStatusChange(item.id, "replied")}
          >
            Mark replied
          </button>
        )}
        {item.status !== "dismissed" && (
          <button
            style={actionBtnStyle}
            onClick={() => onStatusChange(item.id, "dismissed")}
          >
            Dismiss
          </button>
        )}
        {item.status !== "snoozed" && (
          <button
            style={actionBtnStyle}
            onClick={() => onStatusChange(item.id, "snoozed")}
          >
            Snooze
          </button>
        )}
        {item.status !== "pending" && (
          <button
            style={actionBtnStyle}
            onClick={() => onStatusChange(item.id, "pending")}
          >
            Reopen
          </button>
        )}
        <button
          style={actionBtnStyle}
          onClick={() => {
            setShowNoteInput(!showNoteInput);
            if (!showNoteInput) {
              setTimeout(() => noteRef.current?.focus(), 0);
            }
          }}
        >
          {showNoteInput ? "Cancel" : "Add note"}
        </button>
      </div>

      {/* Note input */}
      {showNoteInput && (
        <textarea
          ref={noteRef}
          defaultValue={item.notes ?? ""}
          placeholder="Add a note..."
          style={{
            marginTop: 8,
            width: "100%",
            minHeight: 60,
            background: "var(--cfg-bg)",
            color: "var(--cfg-text)",
            border: "1px solid var(--cfg-border)",
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 12,
            fontFamily: "var(--cfg-mono)",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
          onBlur={(e) => {
            const val = e.currentTarget.value;
            onNotesChange(item.id, val);
            setShowNoteInput(false);
          }}
        />
      )}
    </div>
  );
}
