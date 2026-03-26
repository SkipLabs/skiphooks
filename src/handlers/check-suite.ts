import type { EventHandler, FormattedEvent } from "./types";

const conclusionEmojis: Record<string, string> = {
  success: "✅",
  failure: "❌",
  neutral: "⚪",
  cancelled: "⚫",
  timed_out: "⏱️",
  action_required: "⚠️",
  stale: "⚫",
};

const relevantActions = new Set(["completed"]);

interface CheckSuitePayload {
  action: string;
  check_suite: {
    conclusion?: string | null;
    head_branch?: string | null;
    head_sha?: string;
    url?: string;
    app?: { name?: string; slug?: string } | null;
  };
  repository?: {
    full_name?: string;
    html_url?: string;
  } | null;
}

export const checkSuiteHandler: EventHandler = {
  isRelevantAction(action) {
    return action != null && relevantActions.has(action);
  },

  format(payload): FormattedEvent {
    const { check_suite: suite, repository } = payload as CheckSuitePayload;

    const conclusion = suite.conclusion ?? "unknown";
    const emoji = conclusionEmojis[conclusion] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const appName = suite.app?.name ?? "Check Suite";
    const branch = suite.head_branch ?? "unknown";
    const sha = suite.head_sha?.slice(0, 7) ?? "???????";
    const repoUrl = repository?.html_url ?? "#";

    const lines: string[] = [
      `${emoji} **${appName}** on \`${branch}\` — **${conclusion}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Commit:** [\`${sha}\`](${repoUrl}/commit/${suite.head_sha ?? ""})`,
    ];

    return { markdown: lines.join("\n") };
  },
};
