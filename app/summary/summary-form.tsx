"use client";

import { useState, useEffect, useRef, useMemo } from "react";

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

function buildWeekOptions() {
  const current = getISOWeek(new Date());
  const previous = getISOWeek(new Date(Date.now() - 7 * 86400000));
  return {
    currentWeek: current,
    options: Array.from({ length: 52 }, (_, i) => {
      const num = i + 1;
      const pad = String(num).padStart(2, "0");
      let label = `Week ${pad}`;
      if (num === current) label += " (current)";
      else if (num === previous) label += " (previous)";
      return { value: `week${pad}`, label };
    }),
  };
}

const PROMPT_TEMPLATES = [
  {
    name: "General summary",
    prompt: "Summarize the following messages. Give a concise overview of the key topics, decisions, and action items discussed:",
  },
  {
    name: "Engineering highlights",
    prompt: "Summarize the following messages focusing on engineering work: new features shipped, bugs fixed, technical decisions made, and infrastructure changes. Be concise and use bullet points:",
  },
  {
    name: "Blockers & risks",
    prompt: "Review the following messages and extract any blockers, risks, open questions, or unresolved issues. Group them by severity. If none are found, say so briefly:",
  },
  {
    name: "Team wins",
    prompt: "Review the following messages and highlight team wins, completed milestones, positive outcomes, and shipped features. Keep it upbeat and concise:",
  },
  {
    name: "Action items",
    prompt: "Extract all action items, follow-ups, and next steps from the following messages. List each with the responsible person if mentioned:",
  },
];

export default function SummaryForm({ groups, configuredGroups, authTokenNames }: SummaryFormProps) {
  const { currentWeek, options: WEEK_OPTIONS } = useMemo(buildWeekOptions, []);
  const [groupId, setGroupId] = useState(groups[0]?.slashworkId ?? "");
  const [week, setWeek] = useState(`week${String(currentWeek).padStart(2, "0")}`);
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATES[0]!.prompt);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [postCount, setPostCount] = useState<number | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [error, setError] = useState("");

  // Elapsed time for loading
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  // Publish state
  const [publishGroupId, setPublishGroupId] = useState(groups[0]?.slashworkId ?? "");
  const [publishAs, setPublishAs] = useState(authTokenNames[0] ?? "");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "success" | "error">("idle");
  const [publishError, setPublishError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
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
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setLoading(false);
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

        <div className="sum-templates">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`sum-template-btn${prompt === t.prompt ? " sum-template-btn--active" : ""}`}
              onClick={() => setPrompt(t.prompt)}
            >
              {t.name}
            </button>
          ))}
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
            {loading && (
              <button type="button" className="sum-submit sum-submit--cancel" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {loading && (
          <div className="sum-loading" role="status">
            <div className="sum-loading-dots" aria-hidden="true">
              <span /><span /><span />
            </div>
            <span>Summarizing... {elapsed > 0 && `(${elapsed}s)`}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="sum-error" role="alert">{error}</div>
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
            <div aria-live="polite">
              {publishStatus === "success" && (
                <div className="sum-publish-status sum-publish-status--ok" role="status">
                  Published successfully
                </div>
              )}
              {publishStatus === "error" && (
                <div className="sum-publish-status sum-publish-status--err" role="alert">
                  {publishError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
