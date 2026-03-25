"use client";

import { useState } from "react";

interface SummaryFormProps {
  groups: string[];
}

const WEEK_OPTIONS = [
  { value: "current", label: "Current week" },
  { value: "previous", label: "Previous week" },
  ...Array.from({ length: 52 }, (_, i) => ({
    value: `week${String(i + 1).padStart(2, "0")}`,
    label: `Week ${String(i + 1).padStart(2, "0")}`,
  })),
];

export default function SummaryForm({ groups }: SummaryFormProps) {
  const [group, setGroup] = useState(groups[0] ?? "");
  const [week, setWeek] = useState("current");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [postCount, setPostCount] = useState<number | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSummary("");
    setError("");
    setPostCount(null);
    setWeekLabel("");

    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, week }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setSummary(data.summary);
      setPostCount(data.postCount);
      setWeekLabel(data.weekLabel);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sum-section">
      <form className="sum-form" onSubmit={handleSubmit}>
        <div className="sum-form-row">
          <div className="sum-field">
            <label htmlFor="sum-group">Group</label>
            <select
              id="sum-group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              disabled={groups.length === 0}
            >
              {groups.length === 0 && <option value="">No groups available</option>}
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="sum-field">
            <label htmlFor="sum-week">Week</label>
            <select
              id="sum-week"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            >
              {WEEK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sum-field sum-field--action">
            <button
              type="submit"
              className="sum-submit"
              disabled={loading || groups.length === 0}
            >
              {loading ? "Summarizing..." : "Summarize"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="sum-error">{error}</div>
      )}

      {summary && (
        <div className="sum-result">
          <div className="sum-result-header">
            <span className="sum-result-label">{weekLabel}</span>
            <span className="sum-result-count">
              {postCount} post{postCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="sum-result-body">{summary}</div>
        </div>
      )}
    </div>
  );
}
