import type { EventHandler, FormattedEvent } from "./types";
import { blockquoteExcerpt, relevantActionMatcher } from "./utils";

const actionEmojis: Record<string, string> = {
  opened: "🟢",
  merged: "🟣",
  closed: "🔴",
  review_requested: "🔵",
  ready_for_review: "🟢",
  synchronize: "🔄",
};

interface PRPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    body?: string | null;
    merged?: boolean;
    user?: { login?: string } | null;
    head?: { ref?: string } | null;
    base?: { ref?: string } | null;
  };
  repository?: {
    full_name?: string;
  } | null;
}

export const pullRequestHandler: EventHandler = {
  isRelevantAction: relevantActionMatcher(
    "opened",
    "closed",
    "review_requested",
    "ready_for_review",
    "synchronize",
  ),

  format(payload): FormattedEvent {
    const { action, pull_request: pr, repository } = payload as PRPayload;

    const effectiveAction = action === "closed" && pr.merged ? "merged" : action;
    const emoji = actionEmojis[effectiveAction] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const author = pr.user?.login ?? "unknown";
    const sourceBranch = pr.head?.ref ?? "unknown";
    const targetBranch = pr.base?.ref ?? "unknown";

    const lines: string[] = [
      `${emoji} **PR #${pr.number}** [${pr.title}](${pr.html_url}) was **${effectiveAction}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Author:** ${author}`,
      `**Branch:** \`${sourceBranch}\` → \`${targetBranch}\``,
    ];

    if (pr.body) {
      lines.push("", blockquoteExcerpt(pr.body, 200));
    }

    return { markdown: lines.join("\n") };
  },
};
