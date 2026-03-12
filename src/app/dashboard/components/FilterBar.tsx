"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const selectStyle: React.CSSProperties = {
  background: "var(--cfg-surface)",
  color: "var(--cfg-text)",
  border: "1px solid var(--cfg-border)",
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 13,
  fontFamily: "var(--cfg-mono)",
  cursor: "pointer",
  outline: "none",
};

export default function FilterBar({
  currentStatus,
  currentUrgency,
  currentSubreddit,
}: {
  currentStatus?: string;
  currentUrgency?: string;
  currentSubreddit?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginBottom: 24,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <select
        style={selectStyle}
        value={currentStatus ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="replied">Replied</option>
        <option value="dismissed">Dismissed</option>
        <option value="snoozed">Snoozed</option>
      </select>

      <select
        style={selectStyle}
        value={currentUrgency ?? ""}
        onChange={(e) => updateParam("urgency", e.target.value)}
      >
        <option value="">All urgency</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <input
        type="text"
        placeholder="Subreddit..."
        style={{
          ...selectStyle,
          width: 140,
        }}
        defaultValue={currentSubreddit ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateParam("subreddit", e.currentTarget.value.trim());
          }
        }}
        onBlur={(e) => {
          const val = e.currentTarget.value.trim();
          if (val !== (currentSubreddit ?? "")) {
            updateParam("subreddit", val);
          }
        }}
      />
    </div>
  );
}
