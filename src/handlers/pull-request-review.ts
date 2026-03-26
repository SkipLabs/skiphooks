import type { EventHandler, FormattedEvent } from "./types";

const stateEmojis: Record<string, string> = {
  approved: "✅",
  changes_requested: "🔴",
  commented: "💬",
  dismissed: "⚫",
};

const relevantActions = new Set(["submitted"]);

interface PRReviewPayload {
  action: string;
  review: {
    state?: string;
    html_url: string;
    body?: string | null;
    user?: { login?: string } | null;
  };
  pull_request: {
    number: number;
    title: string;
    html_url: string;
  };
  repository?: {
    full_name?: string;
  } | null;
}

export const pullRequestReviewHandler: EventHandler = {
  isRelevantAction(action) {
    return action != null && relevantActions.has(action);
  },

  format(payload): FormattedEvent {
    const { review, pull_request: pr, repository } = payload as PRReviewPayload;

    const state = review.state ?? "commented";
    const emoji = stateEmojis[state] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const reviewer = review.user?.login ?? "unknown";
    const stateLabel = state.replace(/_/g, " ");

    const lines: string[] = [
      `${emoji} **${reviewer}** ${stateLabel} PR #${pr.number} [${pr.title}](${review.html_url})`,
      "",
      `**Repo:** ${repoName}`,
    ];

    if (review.body) {
      const excerpt = review.body.length > 200 ? review.body.slice(0, 200) + "..." : review.body;
      lines.push("", `> ${excerpt.replace(/\n/g, "\n> ")}`);
    }

    return { markdown: lines.join("\n") };
  },
};
