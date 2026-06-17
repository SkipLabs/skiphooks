import type { EventHandler, FormattedEvent } from "./types";
import { blockquoteExcerpt, relevantActionMatcher } from "./utils";

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
  isRelevantAction: relevantActionMatcher("created"),

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
      lines.push("", blockquoteExcerpt(comment.body, 200));
    }

    return { markdown: lines.join("\n") };
  },
};
