import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getGroups, getAuthToken, getAuthTokens } from "@/src/db";
import { fetchGroupPosts, formatPosts } from "@/src/summary-utils";
import { apiError } from "@/src/api-error";

function computeWeekRange(weekArg: string): { start: string; end: string; label: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let weekNum: number;

  if (weekArg === "current") {
    weekNum = getISOWeek(now);
  } else if (weekArg === "previous") {
    const prev = new Date(now.getTime() - 7 * 86400000);
    weekNum = getISOWeek(prev);
    year = prev.getUTCFullYear();
  } else {
    weekNum = parseInt(weekArg.slice(4), 10);
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000);
  const targetMonday = new Date(week1Monday.getTime() + (weekNum - 1) * 7 * 86400000);
  const targetSunday = new Date(targetMonday.getTime() + 6 * 86400000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const mondayStr = fmt(targetMonday);
  const sundayStr = fmt(targetSunday);

  return {
    start: `${mondayStr}T00:00:00.000Z`,
    end: `${sundayStr}T23:59:59.999Z`,
    label: `week ${String(weekNum).padStart(2, "0")} ${year} (${mondayStr} to ${sundayStr})`,
  };
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: { groupId?: string; group?: string; week?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", "INVALID_JSON", 400);
  }

  const { week } = body;
  if (!week || !/^(current|previous|week\d{2})$/.test(week)) {
    return apiError("week must be 'current', 'previous', or 'weekXX'", "INVALID_WEEK", 400);
  }

  let slashworkId: string;
  let groupLabel: string;

  if (body.groupId) {
    slashworkId = body.groupId;
    groupLabel = body.groupId;
  } else if (body.group) {
    const groups = await getGroups();
    const dbGroup = groups.find((g) => g.name === body.group);
    if (!dbGroup) {
      return apiError(`Group '${body.group}' not found`, "GROUP_NOT_FOUND", 404);
    }
    slashworkId = dbGroup.slashworkId;
    groupLabel = body.group;
  } else {
    return apiError("groupId or group is required", "MISSING_GROUP", 400);
  }

  const authTokens = await getAuthTokens();
  if (authTokens.length === 0) {
    return apiError("No auth tokens configured", "NO_AUTH_TOKENS", 500);
  }
  const authToken = await getAuthToken(authTokens[0]!.name);
  if (!authToken) {
    return apiError("Failed to load auth token", "AUTH_TOKEN_ERROR", 500);
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return apiError("SLASHWORK_GRAPHQL_URL not configured", "MISSING_CONFIG", 500);
  }

  const { start, end, label } = computeWeekRange(week);

  try {
    const weekPosts = await fetchGroupPosts(graphqlUrl, authToken, slashworkId, start, end);

    if (weekPosts.length === 0) {
      return NextResponse.json({
        summary: `No posts found in '${groupLabel}' for ${label}.`,
        postCount: 0,
        weekLabel: label,
      });
    }

    const formatted = formatPosts(weekPosts);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return apiError("ANTHROPIC_API_KEY not configured", "MISSING_CONFIG", 500);
    }
    const anthropic = new Anthropic({ apiKey });
    const aiResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${body.prompt || "Summarize the following messages. Give a concise overview of the key topics, decisions, and action items discussed:"}\n\nGroup: ${groupLabel} | ${label}\n\n${formatted}`,
        },
      ],
    });

    const summaryBlock = aiResponse.content[0] ?? { type: "text" as const, text: "" };
    const summary = summaryBlock.type === "text" ? summaryBlock.text : "";

    return NextResponse.json({
      summary,
      postCount: weekPosts.length,
      weekLabel: label,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(`Summarization failed: ${message}`, "SUMMARIZATION_FAILED", 502);
  }
}
