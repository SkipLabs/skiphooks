import { getUserMappingsBatch } from "./db";

/**
 * Extract GitHub usernames from structured payload fields based on event type.
 */
function extractStructuredUsernames(payload: unknown, eventType: string): string[] {
  const usernames: string[] = [];
  const p = payload as Record<string, unknown>;

  function loginFrom(obj: unknown): string | undefined {
    if (obj && typeof obj === "object" && "login" in (obj as Record<string, unknown>)) {
      const login = (obj as Record<string, unknown>).login;
      return typeof login === "string" ? login : undefined;
    }
  }

  function loginsFromArray(arr: unknown): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map(loginFrom).filter((l): l is string => l != null);
  }

  if (eventType === "pull_request") {
    const pr = p.pull_request as Record<string, unknown> | undefined;
    if (pr) {
      const author = loginFrom(pr.user);
      if (author) usernames.push(author);
      usernames.push(...loginsFromArray(pr.requested_reviewers));
      usernames.push(...loginsFromArray(pr.assignees));
    }
  } else if (eventType === "pull_request_review") {
    const review = p.review as Record<string, unknown> | undefined;
    if (review) {
      const reviewer = loginFrom(review.user);
      if (reviewer) usernames.push(reviewer);
    }
    const pr = p.pull_request as Record<string, unknown> | undefined;
    if (pr) {
      const author = loginFrom(pr.user);
      if (author) usernames.push(author);
    }
  } else if (eventType === "issues") {
    const issue = p.issue as Record<string, unknown> | undefined;
    if (issue) {
      const author = loginFrom(issue.user);
      if (author) usernames.push(author);
      usernames.push(...loginsFromArray(issue.assignees));
    }
    const assignee = loginFrom(p.assignee);
    if (assignee) usernames.push(assignee);
  } else if (eventType === "issue_comment") {
    const comment = p.comment as Record<string, unknown> | undefined;
    if (comment) {
      const author = loginFrom(comment.user);
      if (author) usernames.push(author);
    }
    const issue = p.issue as Record<string, unknown> | undefined;
    if (issue) {
      const author = loginFrom(issue.user);
      if (author) usernames.push(author);
    }
  } else if (eventType === "push") {
    const pusher = p.pusher as Record<string, unknown> | undefined;
    if (pusher && typeof pusher.name === "string") {
      usernames.push(pusher.name);
    }
  }

  return usernames;
}

// Match GitHub @mentions, skipping fenced code blocks and inline code
const GITHUB_USERNAME_RE = /@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)/g;

function extractInlineMentions(markdown: string): string[] {
  // Remove fenced code blocks
  const withoutFenced = markdown.replace(/```[\s\S]*?```/g, "");
  // Remove inline code
  const withoutCode = withoutFenced.replace(/`[^`]*`/g, "");

  const usernames: string[] = [];
  let match;
  while ((match = GITHUB_USERNAME_RE.exec(withoutCode)) !== null) {
    usernames.push(match[1]!);
  }
  return usernames;
}

/**
 * Process a handler's markdown output: detect GitHub usernames from both
 * structured payload fields and inline @mentions, resolve them to Slashwork
 * usernames, and append a cc line if any match.
 */
export async function processGitHubMentions(
  markdown: string,
  payload: unknown,
  eventType: string,
): Promise<string> {
  const structured = extractStructuredUsernames(payload, eventType);
  const inline = extractInlineMentions(markdown);

  const allUsernames = [...new Set([...structured, ...inline].map((u) => u.toLowerCase()))];
  if (allUsernames.length === 0) return markdown;

  const mappings = await getUserMappingsBatch(allUsernames);
  if (mappings.size === 0) return markdown;

  const slashworkUsers = [...new Set(mappings.values())];
  const ccLine = slashworkUsers.map((u) => `@${u}`).join(" ");

  return `${markdown}\n\n---\n**cc:** ${ccLine}`;
}
