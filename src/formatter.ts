const actionEmojis: Record<string, string> = {
  opened: "🟢",
  merged: "🟣",
  closed: "🔴",
  review_requested: "🔵",
  ready_for_review: "🟢",
  synchronize: "🔄",
};

const relevantActions = new Set([
  "opened",
  "closed",
  "review_requested",
  "ready_for_review",
  "synchronize",
]);

export function isRelevantAction(action: string): boolean {
  return relevantActions.has(action);
}

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

export function formatPREvent(payload: PRPayload): string {
  const { action, pull_request: pr, repository } = payload;

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
    const excerpt =
      pr.body.length > 200 ? pr.body.slice(0, 200) + "…" : pr.body;
    lines.push("", `> ${excerpt.replace(/\n/g, "\n> ")}`);
  }

  return lines.join("\n");
}
