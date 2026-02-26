import type { EventHandler, FormattedEvent } from "./types.ts";

const actionEmojis: Record<string, string> = {
  opened: "🟢",
  closed: "🔴",
  reopened: "🟡",
  labeled: "🏷️",
  assigned: "👤",
};

const relevantActions = new Set([
  "opened",
  "closed",
  "reopened",
  "labeled",
  "assigned",
]);

interface IssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    html_url: string;
    body?: string | null;
    user?: { login?: string } | null;
    labels?: Array<{ name?: string }> | null;
    assignee?: { login?: string } | null;
  };
  label?: { name?: string } | null;
  assignee?: { login?: string } | null;
  repository?: {
    full_name?: string;
  } | null;
}

export const issuesHandler: EventHandler = {
  isRelevantAction(action) {
    return action != null && relevantActions.has(action);
  },

  format(payload): FormattedEvent {
    const { action, issue, repository, label, assignee } =
      payload as IssuePayload;

    const emoji = actionEmojis[action] ?? "📋";
    const repoName = repository?.full_name ?? "unknown/repo";
    const author = issue.user?.login ?? "unknown";

    const lines: string[] = [
      `${emoji} **Issue #${issue.number}** [${issue.title}](${issue.html_url}) was **${action}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Author:** ${author}`,
    ];

    if (action === "labeled" && label?.name) {
      lines.push(`**Label:** \`${label.name}\``);
    }

    if (action === "assigned" && assignee?.login) {
      lines.push(`**Assigned to:** ${assignee.login}`);
    }

    if (issue.body) {
      const excerpt =
        issue.body.length > 200 ? issue.body.slice(0, 200) + "…" : issue.body;
      lines.push("", `> ${excerpt.replace(/\n/g, "\n> ")}`);
    }

    return { markdown: lines.join("\n") };
  },
};
