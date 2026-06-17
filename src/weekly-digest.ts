import { summarize } from "./anthropic";
import { getDigestConfig, getAuthToken, updateDigestLastRun } from "./db";
import { fetchGroupPosts, formatPosts, fmtTimestamp } from "./summary-utils";
import { listOwnerRepos, fetchRepoActivity, formatRepoActivity } from "./github-utils";
import { fetchSlashworkGroups } from "./slashwork-sync";
import { postToSlashwork } from "./slashwork";
import { mapWithConcurrency } from "./concurrency";

type LogFn = (level: string, message: string) => void;

// Cap simultaneous Anthropic calls so large orgs don't fan out into rate limits.
const DIGEST_SUMMARY_CONCURRENCY = 5;

export function computeDigestWindow(now: Date = new Date()): { start: string; end: string; label: string } {
  // Find this Thursday 14:00 UTC
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 4=Thu
  const daysToThursday = (4 - dayOfWeek + 7) % 7;
  const thisThursday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToThursday, 14, 0, 0,
  ));

  // If we're at or past this Thursday 14:00, it's the end of the current window.
  // Otherwise the current window ended at the previous Thursday 14:00.
  const end: Date = thisThursday.getTime() <= now.getTime()
    ? thisThursday
    : new Date(thisThursday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${fmtTimestamp(start.toISOString())} to ${fmtTimestamp(end.toISOString())} UTC`,
  };
}

export async function generateDigest(
  graphqlUrl: string,
  authToken: string,
  startDate: string,
  endDate: string,
  prompt?: string,
  log: LogFn = () => {},
): Promise<{ markdown: string; groupCount: number; totalPosts: number; repoCount: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const activeGroups = await fetchSlashworkGroups({ graphqlUrl, authToken });

  const githubOwner = process.env.GITHUB_OWNER;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepoNames = githubOwner
    ? await listOwnerRepos(githubOwner, githubToken).catch((err) => {
        log("error", `Digest: failed to list repos for ${githubOwner}: ${err}`);
        return [] as string[];
      })
    : [];
  const githubRepos = githubRepoNames.map((repo) => ({ owner: githubOwner!, repo }));

  log("info", `Digest: fetching posts from ${activeGroups.length} groups and ${githubRepos.length} repos`);

  // Per-group summaries
  const groupResults = await mapWithConcurrency(
    activeGroups,
    DIGEST_SUMMARY_CONCURRENCY,
    async (group) => {
      const posts = await fetchGroupPosts(graphqlUrl, authToken, group.slashworkId, startDate, endDate);
      if (posts.length === 0) return null;

      const formatted = formatPosts(posts);
      const summary = await summarize(
        `Summarize the following messages from the "${group.name}" group. Be concise — 2-4 bullet points max:\n\n${formatted}`,
        1024,
      );
      if (!summary) return null;

      log("info", `Digest: ${group.name} — ${posts.length} posts summarized`);
      return { label: `Group: ${group.name}`, summary, postCount: posts.length };
    },
  );

  const groupSummaries = groupResults.flatMap((r, i) => {
    if (r.status === "rejected") {
      log("error", `Digest: failed to process group "${activeGroups[i]!.name}": ${r.reason}`);
      return [];
    }
    return r.value ? [r.value] : [];
  });

  // Per-repo summaries
  const repoResults = await mapWithConcurrency(
    githubRepos,
    DIGEST_SUMMARY_CONCURRENCY,
    async (gh) => {
      const activity = await fetchRepoActivity(gh.owner, gh.repo, startDate, endDate, githubToken);
      const formatted = formatRepoActivity(gh.owner, gh.repo, activity);

      const hasActivity =
        activity.mergedPRs.length > 0 ||
        activity.openedPRs.length > 0 ||
        activity.releases.length > 0 ||
        activity.commits.length > 0;

      if (!hasActivity) return null;

      const summary = await summarize(
        `Summarize the following GitHub activity from "${gh.owner}/${gh.repo}". Highlight what shipped (merged PRs, releases), what is actively in review (open PRs), and any notable commits. Be concise — 2-4 bullet points max:\n\n${formatted}`,
        1024,
      );
      if (!summary) return null;

      const postCount = activity.mergedPRs.length + activity.openedPRs.length + activity.releases.length + activity.commits.length;
      log("info", `Digest: ${gh.owner}/${gh.repo} — ${postCount} events summarized`);
      return { label: `Repo: ${gh.owner}/${gh.repo}`, summary, postCount };
    },
  );

  const repoSummaries = repoResults.flatMap((r, i) => {
    if (r.status === "rejected") {
      log("error", `Digest: failed to process repo "${githubRepos[i]!.owner}/${githubRepos[i]!.repo}": ${r.reason}`);
      return [];
    }
    return r.value ? [r.value] : [];
  });

  const allSummaries = [...groupSummaries, ...repoSummaries];

  if (allSummaries.length === 0) {
    return { markdown: "No activity found across any groups or repositories for this period.", groupCount: 0, totalPosts: 0, repoCount: 0 };
  }

  // Meta-summary
  const perSourceText = allSummaries
    .map((s) => `## ${s.label} (${s.postCount} items)\n${s.summary}`)
    .join("\n\n");

  const metaPrompt = prompt ||
    "Create a unified weekly digest from the per-source summaries below. Sources include team discussions (Slashwork groups) and code activity (GitHub repositories). Structure it as: a brief overall overview paragraph, then key highlights organized by theme rather than by source, then any open questions or follow-ups from discussions. Use markdown formatting. Focus on what the team shipped and decided — do not invent action items from code activity.";

  const markdown = await summarize(
    `${metaPrompt}\n\nPer-source summaries:\n\n${perSourceText}`,
    2048,
  );
  const totalPosts = groupSummaries.reduce((sum, g) => sum + g.postCount, 0);

  return { markdown, groupCount: groupSummaries.length, totalPosts, repoCount: repoSummaries.length };
}

export function startWeeklyDigestPoller(
  graphqlUrl: string,
  log: LogFn,
): ReturnType<typeof setInterval> {
  const HOUR_MS = 60 * 60 * 1000;
  const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
  let running = false;

  return setInterval(async () => {
    const now = new Date();

    // Only run on Thursdays between 14:00-14:59 UTC
    if (now.getUTCDay() !== 4 || now.getUTCHours() !== 14) return;

    // Guard against overlapping runs
    if (running) {
      log("warn", "Digest poller: previous run still in progress, skipping");
      return;
    }

    running = true;
    try {
      const config = await getDigestConfig();
      if (!config || !config.enabled) return;

      // Skip if already ran this week
      if (config.lastRunAt && (now.getTime() - config.lastRunAt.getTime()) < SIX_DAYS_MS) {
        return;
      }

      const authToken = await getAuthToken(config.authToken);
      if (!authToken) {
        log("error", "Digest poller: auth token not found");
        return;
      }

      log("info", "Digest poller: generating weekly digest...");

      const { start, end } = computeDigestWindow(now);
      const { markdown } = await generateDigest(graphqlUrl, authToken, start, end, undefined, log);

      await postToSlashwork(
        { graphqlUrl, authToken },
        config.targetGroupId,
        markdown,
      );

      await updateDigestLastRun();
      log("info", "Digest poller: posted weekly digest successfully");
    } catch (err) {
      log("error", `Digest poller: ${err}`);
    } finally {
      running = false;
    }
  }, HOUR_MS);
}
