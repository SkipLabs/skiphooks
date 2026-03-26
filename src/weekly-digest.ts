import Anthropic from "@anthropic-ai/sdk";
import { getDiscoveredGroups, getDigestConfig, getAuthToken, updateDigestLastRun } from "./db";
import { fetchGroupPosts, formatPosts } from "./summary-utils";
import { postToSlashwork } from "./slashwork";

type LogFn = (level: string, message: string) => void;

export function computeDigestWindow(now: Date = new Date()): { start: string; end: string; label: string } {
  // Find this Thursday 14:00 UTC
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 4=Thu
  const daysToThursday = (4 - dayOfWeek + 7) % 7;
  const thisThursday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToThursday, 14, 0, 0,
  ));

  // If we're past Thursday 14:00, thisThursday is next week — use it as end
  // Otherwise thisThursday is upcoming — use it as end
  let end: Date;
  if (thisThursday.getTime() <= now.getTime()) {
    end = thisThursday;
  } else {
    end = thisThursday;
  }

  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${fmt(start)} to ${fmt(end)} UTC`,
  };
}

export async function generateDigest(
  graphqlUrl: string,
  authToken: string,
  startDate: string,
  endDate: string,
  prompt?: string,
  log: LogFn = () => {},
): Promise<{ markdown: string; groupCount: number; totalPosts: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const groups = await getDiscoveredGroups();
  const activeGroups = groups.filter((g) => g.name.length > 0);

  log("info", `Digest: fetching posts from ${activeGroups.length} groups`);

  // Per-group summaries
  const groupSummaries: Array<{ name: string; summary: string; postCount: number }> = [];
  const anthropic = new Anthropic({ apiKey });

  for (const group of activeGroups) {
    try {
      const posts = await fetchGroupPosts(graphqlUrl, authToken, group.slashworkId, startDate, endDate);
      if (posts.length === 0) continue;

      const formatted = formatPosts(posts);
      const aiResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Summarize the following messages from the "${group.name}" group. Be concise — 2-4 bullet points max:\n\n${formatted}`,
          },
        ],
      });

      const block = aiResponse.content[0];
      const summary = block && block.type === "text" ? block.text : "";
      if (summary) {
        groupSummaries.push({ name: group.name, summary, postCount: posts.length });
        log("info", `Digest: ${group.name} — ${posts.length} posts summarized`);
      }
    } catch (err) {
      log("error", `Digest: failed to process group "${group.name}": ${err}`);
    }
  }

  if (groupSummaries.length === 0) {
    return { markdown: "No activity found across any groups for this period.", groupCount: 0, totalPosts: 0 };
  }

  // Meta-summary
  const perGroupText = groupSummaries
    .map((g) => `## ${g.name} (${g.postCount} posts)\n${g.summary}`)
    .join("\n\n");

  const metaPrompt = prompt ||
    "Create a unified weekly digest from the per-group summaries below. Structure it as: a brief overall overview, then key highlights organized by theme (not by group), then any action items. Use markdown formatting.";

  const metaResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `${metaPrompt}\n\nPer-group summaries:\n\n${perGroupText}`,
      },
    ],
  });

  const metaBlock = metaResponse.content[0];
  const markdown = metaBlock && metaBlock.type === "text" ? metaBlock.text : "";
  const totalPosts = groupSummaries.reduce((sum, g) => sum + g.postCount, 0);

  return { markdown, groupCount: groupSummaries.length, totalPosts };
}

export function startWeeklyDigestPoller(
  graphqlUrl: string,
  log: LogFn,
): ReturnType<typeof setInterval> {
  const HOUR_MS = 60 * 60 * 1000;
  const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

  return setInterval(async () => {
    const now = new Date();

    // Only run on Thursdays between 14:00-14:59 UTC
    if (now.getUTCDay() !== 4 || now.getUTCHours() !== 14) return;

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
    }
  }, HOUR_MS);
}
