import type { EventHandler, FormattedEvent } from "./types";

const stateEmojis: Record<string, string> = {
  success: "✅",
  failure: "❌",
  error: "❌",
  pending: "🕐",
  in_progress: "🔄",
  queued: "🕐",
  inactive: "⚫",
};

export const deploymentStatusHandler: EventHandler = {
  isRelevantAction() {
    // deployment_status events have no action field — always relevant
    return true;
  },

  format(payload): FormattedEvent {
    const {
      deployment_status: status,
      deployment,
      repository,
    } = payload as DeploymentStatusPayload;

    const state = status.state ?? "unknown";
    const emoji = stateEmojis[state] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const environment = deployment.environment ?? "unknown";
    const creator = deployment.creator?.login ?? "unknown";

    const lines: string[] = [
      `${emoji} **Deployment** to \`${environment}\` — **${state}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Ref:** \`${deployment.ref ?? "unknown"}\``,
      `**By:** ${creator}`,
    ];

    if (status.description) {
      lines.push(`**Details:** ${status.description}`);
    }

    if (status.target_url) {
      lines.push("", `[View deployment](${status.target_url})`);
    }

    return { markdown: lines.join("\n") };
  },
};

interface DeploymentStatusPayload {
  deployment_status: {
    state?: string;
    description?: string | null;
    target_url?: string | null;
  };
  deployment: {
    ref?: string;
    environment?: string;
    creator?: { login?: string } | null;
  };
  repository?: {
    full_name?: string;
  } | null;
}
