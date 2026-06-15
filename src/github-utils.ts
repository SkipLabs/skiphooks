interface GitHubPR {
  number: number;
  title: string;
  merged_at: string | null;
  created_at: string;
  user: { login: string } | null;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  body: string | null;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
}

export interface RepoActivity {
  mergedPRs: GitHubPR[];
  openedPRs: GitHubPR[];
  releases: GitHubRelease[];
  commits: GitHubCommit[];
}

export async function listOwnerRepos(owner: string, token?: string): Promise<string[]> {
  // Try org endpoint first; fall back to user endpoint
  let raw: unknown;
  try {
    raw = await githubFetch(`https://api.github.com/orgs/${owner}/repos?per_page=100&sort=updated`, token);
  } catch {
    raw = await githubFetch(`https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`, token);
  }
  return (raw as Array<{ name: string }>).map((r) => r.name);
}

async function githubFetch(url: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${url}`);
  return res.json();
}

export async function fetchRepoActivity(
  owner: string,
  repo: string,
  start: string,
  end: string,
  token?: string,
): Promise<RepoActivity> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const [prsRaw, releasesRaw, commitsRaw] = await Promise.all([
    githubFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=100`, token),
    githubFetch(`${base}/releases?per_page=20`, token),
    githubFetch(`${base}/commits?since=${start}&until=${end}&per_page=100`, token),
  ]);

  const prs = prsRaw as GitHubPR[];
  const releases = (releasesRaw as GitHubRelease[]).filter(
    (r) => r.published_at >= start && r.published_at <= end,
  );
  const commits = commitsRaw as GitHubCommit[];

  const mergedPRs = prs.filter((pr) => pr.merged_at && pr.merged_at >= start && pr.merged_at <= end);
  const openedPRs = prs.filter((pr) => pr.created_at >= start && pr.created_at <= end && !pr.merged_at);

  return { mergedPRs, openedPRs, releases, commits };
}

export function formatRepoActivity(owner: string, repo: string, activity: RepoActivity): string {
  const lines: string[] = [`=== GitHub: ${owner}/${repo} ===`, ""];

  if (activity.mergedPRs.length > 0) {
    lines.push("**Merged Pull Requests:**");
    for (const pr of activity.mergedPRs) {
      const date = pr.merged_at!.slice(0, 10);
      lines.push(`- #${pr.number} ${pr.title} (by @${pr.user?.login ?? "unknown"}, merged ${date})`);
    }
    lines.push("");
  }

  if (activity.openedPRs.length > 0) {
    lines.push("**New Pull Requests (open):**");
    for (const pr of activity.openedPRs) {
      const date = pr.created_at.slice(0, 10);
      lines.push(`- #${pr.number} ${pr.title} (by @${pr.user?.login ?? "unknown"}, opened ${date})`);
    }
    lines.push("");
  }

  if (activity.releases.length > 0) {
    lines.push("**Releases:**");
    for (const r of activity.releases) {
      const date = r.published_at.slice(0, 10);
      const name = r.name || r.tag_name;
      lines.push(`- ${name} (${date})`);
      if (r.body) {
        lines.push(`  ${r.body.trim().slice(0, 300)}`);
      }
    }
    lines.push("");
  }

  if (activity.commits.length > 0) {
    lines.push(`**Commits (${activity.commits.length} total):**`);
    for (const c of activity.commits.slice(0, 20)) {
      const msg = c.commit.message.split("\n")[0] ?? "";
      const author = c.author?.login ?? c.commit.author?.name ?? "unknown";
      const date = (c.commit.author?.date ?? "").slice(0, 10);
      lines.push(`- ${c.sha.slice(0, 7)} ${msg} (${author}, ${date})`);
    }
    if (activity.commits.length > 20) {
      lines.push(`  ... and ${activity.commits.length - 20} more`);
    }
    lines.push("");
  }

  if (
    activity.mergedPRs.length === 0 &&
    activity.openedPRs.length === 0 &&
    activity.releases.length === 0 &&
    activity.commits.length === 0
  ) {
    lines.push("No activity found for this period.");
    lines.push("");
  }

  return lines.join("\n");
}
