import type { EventHandler, FormattedEvent } from "./types";
import { relevantActionMatcher } from "./utils";

const statusEmojis: Record<string, string> = {
  completed: "✅",
  failure: "❌",
  cancelled: "⚫",
  timed_out: "⏱️",
  action_required: "⚠️",
  in_progress: "🔄",
  queued: "🕐",
};

interface WorkflowRunPayload {
  action: string;
  workflow_run: {
    id: number;
    name?: string | null;
    html_url: string;
    conclusion?: string | null;
    head_branch?: string | null;
    head_sha?: string;
    run_number?: number;
    run_started_at?: string | null;
    updated_at?: string | null;
    actor?: { login?: string } | null;
  };
  repository?: {
    full_name?: string;
  } | null;
}

export const workflowRunHandler: EventHandler = {
  isRelevantAction: relevantActionMatcher("completed"),

  format(payload): FormattedEvent {
    const { workflow_run: run, repository } = payload as WorkflowRunPayload;

    const conclusion = run.conclusion ?? "unknown";
    const emoji = statusEmojis[conclusion] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const actor = run.actor?.login ?? "unknown";
    const name = run.name ?? "Workflow";

    const lines: string[] = [
      `${emoji} **${name}** #${run.run_number ?? run.id} — **${conclusion}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Branch:** \`${run.head_branch ?? "unknown"}\``,
      `**Triggered by:** ${actor}`,
    ];

    if (run.run_started_at && run.updated_at) {
      const ms = new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime();
      const secs = Math.round(ms / 1000);
      const mins = Math.floor(secs / 60);
      const remSecs = secs % 60;
      lines.push(`**Duration:** ${mins > 0 ? `${mins}m ` : ""}${remSecs}s`);
    }

    lines.push("", `[View run](${run.html_url})`);

    return { markdown: lines.join("\n") };
  },
};
