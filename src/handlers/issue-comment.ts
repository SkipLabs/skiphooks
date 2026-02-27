import type { EventHandler, FormattedEvent } from "./types.ts";

const relevantActions = new Set(["created"]);

interface IssueCommentPayload {
  action: string;
  comment: {
    html_url: string;
    body?: string | null;
    user?: { login?: string } | null;
  };
  issue: {
    number: number;
    title: string;
    html_url: string;
    pull_request?: unknown;
  };
  repository?: {
    full_name?: string;
  } | null;
}

export const issueCommentHandler: EventHandler = {
  isRelevantAction(action) {
    return action != null && relevantActions.has(action);
  },

  format(payload): FormattedEvent {
    const { comment, issue, repository } = payload as IssueCommentPayload;

    const repoName = repository?.full_name ?? "unknown/repo";
    const author = comment.user?.login ?? "unknown";
    const kind = issue.pull_request ? "PR" : "Issue";

    const lines: string[] = [
      `💬 **${author}** commented on ${kind} #${issue.number} [${issue.title}](${comment.html_url})`,
      "",
      `**Repo:** ${repoName}`,
    ];

    if (comment.body) {
      const excerpt =
        comment.body.length > 200
          ? comment.body.slice(0, 200) + "…"
          : comment.body;
      lines.push("", `> ${excerpt.replace(/\n/g, "\n> ")}`);
    }

    return { markdown: lines.join("\n") };
  },
};
