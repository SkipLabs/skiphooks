"use client";

import { useState } from "react";
import type { PipelineConfig } from "@/src/lib/config";

interface ScoutConfigFormProps {
  initialConfig: PipelineConfig;
}

export default function ScoutConfigForm({ initialConfig }: ScoutConfigFormProps) {
  const [subreddits, setSubreddits] = useState(initialConfig.subreddits.join(", "));
  const [topicDescription, setTopicDescription] = useState(initialConfig.topicDescription);
  const [replyPersona, setReplyPersona] = useState(initialConfig.replyPersona);
  const [threadThreshold, setThreadThreshold] = useState(initialConfig.threadThreshold);
  const [commentThreshold, setCommentThreshold] = useState(initialConfig.commentThreshold);
  const [rateLimitMs, setRateLimitMs] = useState(initialConfig.rateLimitMs);
  const [pollIntervalMs, setPollIntervalMs] = useState(initialConfig.pollIntervalMs);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    setErrorMsg("");

    const payload = {
      subreddits: subreddits.split(",").map((s) => s.trim()).filter(Boolean),
      topicDescription,
      replyPersona,
      threadThreshold,
      commentThreshold,
      rateLimitMs,
      pollIntervalMs,
    };

    try {
      const res = await fetch("/api/scout/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="scout-config-form" onSubmit={handleSubmit}>
      <div className="scout-config-field">
        <label htmlFor="subreddits">Subreddits</label>
        <input
          id="subreddits"
          type="text"
          value={subreddits}
          onChange={(e) => setSubreddits(e.target.value)}
          placeholder="reactjs, nextjs, webdev"
        />
        <span className="scout-config-hint">Comma-separated list</span>
      </div>

      <div className="scout-config-field">
        <label htmlFor="topicDescription">Topic Description</label>
        <textarea
          id="topicDescription"
          value={topicDescription}
          onChange={(e) => setTopicDescription(e.target.value)}
          rows={3}
          placeholder="Describe the topics you want to find..."
        />
      </div>

      <div className="scout-config-field">
        <label htmlFor="replyPersona">Reply Persona</label>
        <textarea
          id="replyPersona"
          value={replyPersona}
          onChange={(e) => setReplyPersona(e.target.value)}
          rows={3}
          placeholder="Describe the persona for reply suggestions..."
        />
      </div>

      <div className="scout-config-row">
        <div className="scout-config-field">
          <label htmlFor="threadThreshold">Thread Threshold</label>
          <input
            id="threadThreshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={threadThreshold}
            onChange={(e) => setThreadThreshold(parseFloat(e.target.value))}
          />
        </div>
        <div className="scout-config-field">
          <label htmlFor="commentThreshold">Comment Threshold</label>
          <input
            id="commentThreshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={commentThreshold}
            onChange={(e) => setCommentThreshold(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="scout-config-row">
        <div className="scout-config-field">
          <label htmlFor="rateLimitMs">Rate Limit (ms)</label>
          <input
            id="rateLimitMs"
            type="number"
            min={100}
            step={100}
            value={rateLimitMs}
            onChange={(e) => setRateLimitMs(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="scout-config-field">
          <label htmlFor="pollIntervalMs">Poll Interval (ms)</label>
          <input
            id="pollIntervalMs"
            type="number"
            min={1000}
            step={1000}
            value={pollIntervalMs}
            onChange={(e) => setPollIntervalMs(parseInt(e.target.value, 10))}
          />
        </div>
      </div>

      <div className="scout-config-actions">
        <button type="submit" className="scout-config-submit" disabled={saving}>
          {saving ? "Saving..." : "Save & Restart Pipeline"}
        </button>
        {status === "success" && (
          <span className="scout-config-status scout-config-status--ok">
            Saved — pipeline restarting
          </span>
        )}
        {status === "error" && (
          <span className="scout-config-status scout-config-status--err">
            {errorMsg}
          </span>
        )}
      </div>
    </form>
  );
}
