"use client";

import { useState } from "react";

interface GroupOption {
  name: string;
  slashworkId: string;
}

interface SummaryFormProps {
  groups: GroupOption[];
  configuredGroups: string[];
  authTokenNames: string[];
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const currentWeek = getISOWeek(new Date());
const previousWeek = getISOWeek(new Date(Date.now() - 7 * 86400000));

const WEEK_OPTIONS = Array.from({ length: 52 }, (_, i) => {
  const num = i + 1;
  const pad = String(num).padStart(2, "0");
  let label = `Week ${pad}`;
  if (num === currentWeek) label += " (current)";
  else if (num === previousWeek) label += " (previous)";
  return { value: `week${pad}`, label };
});

const DEFAULT_PROMPT =
  "Summarize the following messages. Give a concise overview of the key topics, decisions, and action items discussed:";

export default function SummaryForm({ groups, configuredGroups, authTokenNames }: SummaryFormProps) {
  const [groupId, setGroupId] = useState(groups[0]?.slashworkId ?? "");
  const [week, setWeek] = useState(`week${String(currentWeek).padStart(2, "0")}`);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [postCount, setPostCount] = useState<number | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [error, setError] = useState("");

  // Publish state
  const [publishGroupId, setPublishGroupId] = useState(groups[0]?.slashworkId ?? "");
  const [publishAs, setPublishAs] = useState(authTokenNames[0] ?? "");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "success" | "error">("idle");
  const [publishError, setPublishError] = useState("");

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
        body: JSON.stringify({ groupId, week, prompt: prompt.trim() || undefined }),
      });

      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server error (HTTP ${res.status})`);
      }

      if (!res.ok) {
        throw new Error((data.error as string) || `HTTP ${res.status}`);
      }

      setSummary(data.summary as string);
      setPostCount(data.postCount as number);
      setWeekLabel(data.weekLabel as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishStatus("idle");
    setPublishError("");

    try {
      const res = await fetch("/api/summary/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetGroupId: publishGroupId,
          authTokenName: publishAs,
          markdown: summary,
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server error (HTTP ${res.status})`);
      }

      if (!res.ok) {
        throw new Error((data.error as string) || `HTTP ${res.status}`);
      }

      setPublishStatus("success");
      setTimeout(() => setPublishStatus("idle"), 5000);
    } catch (err) {
      setPublishStatus("error");
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
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
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={groups.length === 0}
            >
              {groups.length === 0 && <option value="">No groups available</option>}
              {groups.map((g) => (
                <option key={g.slashworkId} value={g.slashworkId}>
                  {g.name}
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

        </div>

        <div className="sum-field">
          <label htmlFor="sum-prompt">Prompt</label>
          <textarea
            id="sum-prompt"
            className="sum-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
        </div>

        <div className="sum-form-row">
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

      {loading && (
        <div className="sum-loading">
          <div className="sum-loading-dots">
            <span /><span /><span />
          </div>
          <span>Summarizing...</span>
        </div>
      )}

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

          <div className="sum-publish">
            <div className="sum-publish-header">Publish</div>
            <div className="sum-form-row">
              <div className="sum-field">
                <label htmlFor="sum-publish-group">Post to</label>
                <select
                  id="sum-publish-group"
                  value={publishGroupId}
                  onChange={(e) => setPublishGroupId(e.target.value)}
                >
                  {groups.map((g) => (
                    <option key={g.slashworkId} value={g.slashworkId}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="sum-field">
                <label htmlFor="sum-publish-as">Post as</label>
                <select
                  id="sum-publish-as"
                  value={publishAs}
                  onChange={(e) => setPublishAs(e.target.value)}
                >
                  {authTokenNames.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="sum-field sum-field--action">
                <button
                  type="button"
                  className="sum-publish-btn"
                  disabled={publishing}
                  onClick={handlePublish}
                >
                  {publishing ? "Publishing..." : "Publish"}
                </button>
              </div>
            </div>
            {publishStatus === "success" && (
              <div className="sum-publish-status sum-publish-status--ok">
                Published successfully
              </div>
            )}
            {publishStatus === "error" && (
              <div className="sum-publish-status sum-publish-status--err">
                {publishError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
