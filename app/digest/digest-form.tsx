"use client";

import { useState, useEffect, useRef } from "react";

interface GroupOption {
  name: string;
  slashworkId: string;
}

interface DigestConfig {
  targetGroupId: string;
  authToken: string;
  enabled: boolean;
  lastRunAt: string | null;
}

interface DigestFormProps {
  groups: GroupOption[];
  groupCount: number;
  authTokenNames: string[];
  initialConfig: DigestConfig | null;
}

function nextThursday2pm(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  let daysToThu = (4 - day + 7) % 7;
  // If today is Thursday but past 14:00, next week
  if (daysToThu === 0 && now.getUTCHours() >= 14) daysToThu = 7;
  // If today is Thursday before 14:00, it's today
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToThu, 14, 0,
  ));
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return "invalid range";
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days === 0) return `${hours} hours`;
  if (remainingHours === 0) return `${days} day${days !== 1 ? "s" : ""}`;
  return `${days} day${days !== 1 ? "s" : ""}, ${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`;
}

function defaultWindowStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  // Last Thursday 14:00 UTC
  const daysBack = (day + 3) % 7; // days since last Thursday
  const lastThu = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack, 14, 0,
  ));
  return lastThu.toISOString().slice(0, 16);
}

function defaultWindowEnd(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToThu = (4 - day + 7) % 7 || 7;
  const nextThu = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToThu, 14, 0,
  ));
  // If today is Thursday and before 14:00, use today
  if (day === 4 && now.getUTCHours() < 14) {
    return new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0,
    )).toISOString().slice(0, 16);
  }
  return nextThu.toISOString().slice(0, 16);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DigestForm({ groups, groupCount, authTokenNames, initialConfig }: DigestFormProps) {
  // Config state
  const [targetGroupId, setTargetGroupId] = useState(initialConfig?.targetGroupId ?? groups[0]?.slashworkId ?? "");
  const [postAs, setPostAs] = useState(initialConfig?.authToken ?? authTokenNames[0] ?? "");
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Generate state
  const [windowStart, setWindowStart] = useState(defaultWindowStart);
  const [windowEnd, setWindowEnd] = useState(defaultWindowEnd);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [digest, setDigest] = useState("");
  const [digestMeta, setDigestMeta] = useState<{ groupCount: number; totalPosts: number } | null>(null);
  const [genError, setGenError] = useState("");

  // Elapsed time for generation
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (generating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating]);

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"idle" | "success" | "error">("idle");
  const [publishError, setPublishError] = useState("");

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/digest/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupId, authToken: postAs, enabled }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGenerating(true);
    setDigest("");
    setDigestMeta(null);
    setGenError("");
    setPublishStatus("idle");

    try {
      const res = await fetch("/api/digest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: new Date(windowStart).toISOString(),
          end: new Date(windowEnd).toISOString(),
          prompt: prompt.trim() || undefined,
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setDigest(data.markdown);
      setDigestMeta({ groupCount: data.groupCount, totalPosts: data.totalPosts });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function handleCancelGenerate() {
    abortRef.current?.abort();
    setGenerating(false);
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishStatus("idle");
    setPublishError("");
    try {
      const res = await fetch("/api/digest/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: digest }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPublishStatus("success");
      setTimeout(() => setPublishStatus("idle"), 5000);
    } catch (err) {
      setPublishStatus("error");
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const targetGroupName = groups.find((g) => g.slashworkId === targetGroupId)?.name ?? "—";

  return (
    <>
      {/* Configuration */}
      <div className="dig-section">
        <div className="dig-section-header">Configuration</div>
        <form className="dig-config-form" onSubmit={handleSaveConfig}>
          <div className="dig-form-row">
            <div className="dig-field">
              <label htmlFor="dig-target">Post to</label>
              <select id="dig-target" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.slashworkId} value={g.slashworkId}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="dig-field">
              <label htmlFor="dig-as">Post as</label>
              <select id="dig-as" value={postAs} onChange={(e) => setPostAs(e.target.value)}>
                {authTokenNames.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="dig-field dig-field--toggle">
              <label htmlFor="dig-enabled">Auto-post</label>
              <button
                type="button"
                id="dig-enabled"
                role="switch"
                aria-checked={enabled}
                className={`dig-toggle ${enabled ? "dig-toggle--on" : ""}`}
                onClick={() => setEnabled(!enabled)}
              >
                <span className="dig-toggle-dot" />
              </button>
            </div>
          </div>
          <div className="dig-config-actions">
            <button type="submit" className="dig-btn dig-btn--primary" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <span aria-live="polite">
              {saveStatus === "success" && <span className="dig-status dig-status--ok" role="status">Saved</span>}
              {saveStatus === "error" && <span className="dig-status dig-status--err" role="alert">{saveError}</span>}
            </span>
          </div>
          <div className="dig-status-card">
            <div className="dig-status-row">
              <span className="dig-status-key">Schedule</span>
              <span className="dig-status-val">
                {enabled
                  ? <><span className="dig-dot dig-dot--on" aria-hidden="true" /> Every Thursday at 2:00 PM UTC</>
                  : <><span className="dig-dot dig-dot--off" aria-hidden="true" /> Disabled</>}
              </span>
            </div>
            <div className="dig-status-row">
              <span className="dig-status-key">Next run</span>
              <span className="dig-status-val">
                {enabled ? formatDate(nextThursday2pm().toISOString()) : "—"}
              </span>
            </div>
            <div className="dig-status-row">
              <span className="dig-status-key">Last run</span>
              <span className="dig-status-val">
                {initialConfig?.lastRunAt ? formatDate(initialConfig.lastRunAt) : "Never"}
              </span>
            </div>
            <div className="dig-status-row">
              <span className="dig-status-key">Target</span>
              <span className="dig-status-val">{targetGroupName}</span>
            </div>
            <div className="dig-status-row">
              <span className="dig-status-key">Post as</span>
              <span className="dig-status-val">{postAs}</span>
            </div>
            <div className="dig-status-row">
              <span className="dig-status-key">Groups to scan</span>
              <span className="dig-status-val">{groupCount}</span>
            </div>
          </div>
        </form>
      </div>

      {/* Manual trigger */}
      <div className="dig-section">
        <div className="dig-section-header">Generate Digest</div>
        <div className="dig-form-row">
          <div className="dig-field">
            <label htmlFor="dig-start">From</label>
            <input id="dig-start" type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          </div>
          <div className="dig-field">
            <label htmlFor="dig-end">To</label>
            <input id="dig-end" type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          </div>
        </div>

        <div className="dig-window-info">
          <span>{formatDuration(windowStart, windowEnd)} window</span>
          <span>{groupCount} groups will be scanned</span>
        </div>

        <div className="dig-field">
          <label htmlFor="dig-prompt">Custom prompt (optional)</label>
          <textarea
            id="dig-prompt"
            className="dig-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Leave empty for default digest prompt..."
          />
        </div>

        <div className="dig-config-actions">
          <button
            type="button"
            className="dig-btn dig-btn--primary"
            disabled={generating}
            onClick={handleGenerate}
          >
            {generating ? "Generating..." : "Generate"}
          </button>
          {generating && (
            <button type="button" className="dig-btn dig-btn--outline" onClick={handleCancelGenerate}>
              Cancel
            </button>
          )}
        </div>

        <div aria-live="polite">
          {generating && (
            <div className="dig-loading" role="status">
              <div className="dig-loading-dots" aria-hidden="true"><span /><span /><span /></div>
              <span>Generating digest across all groups... {elapsed > 0 && `(${elapsed}s)`}</span>
            </div>
          )}
        </div>

        {genError && <div className="dig-error" role="alert">{genError}</div>}

        {digest && (
          <div className="dig-result">
            <div className="dig-result-header">
              <span className="dig-result-label">Digest Preview</span>
              {digestMeta && (
                <span className="dig-result-count">
                  {digestMeta.groupCount} groups, {digestMeta.totalPosts} posts
                </span>
              )}
            </div>
            <div className="dig-result-body">{digest}</div>

            <div className="dig-publish">
              <button
                type="button"
                className="dig-btn dig-btn--green"
                disabled={publishing || !targetGroupId}
                onClick={handlePublish}
              >
                {publishing ? "Publishing..." : `Publish to ${targetGroupName}`}
              </button>
              <span aria-live="polite">
                {publishStatus === "success" && <span className="dig-status dig-status--ok" role="status">Published</span>}
                {publishStatus === "error" && <span className="dig-status dig-status--err" role="alert">{publishError}</span>}
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
