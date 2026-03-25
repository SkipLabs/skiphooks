import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getGroups, getAuthToken } from "@/src/db";
import { getAnthropicClient } from "@/src/lib/scoring/client";

const FETCH_POSTS_QUERY = `
  query FetchGroupPosts($groupId: ID!, $first: Int!) {
    fetch__Group(id: $groupId) {
      name
      posts(first: $first) {
        edges {
          node {
            id
            markdown
            created
            author { id name }
            comments(first: 100) {
              edges {
                node {
                  markdown
                  created
                  author { name }
                  replies(first: 100) {
                    edges {
                      node {
                        markdown
                        created
                        author { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface PostNode {
  id: string;
  markdown: string;
  created: string;
  author: { id: string; name: string };
  comments: {
    edges: Array<{
      node: {
        markdown: string;
        created: string;
        author: { name: string };
        replies: {
          edges: Array<{
            node: {
              markdown: string;
              created: string;
              author: { name: string };
            };
          }>;
        };
      };
    }>;
  };
}

interface FetchResponse {
  data?: {
    fetch__Group: {
      name: string;
      posts: { edges: Array<{ node: PostNode }> };
    };
  };
  errors?: Array<{ message: string }>;
}

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
    // weekXX
    weekNum = parseInt(weekArg.slice(4), 10);
  }

  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // 1=Mon, 7=Sun
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

function formatPosts(posts: PostNode[]): string {
  const lines: string[] = [];
  for (const post of posts) {
    const date = new Date(post.created).toISOString().slice(0, 16).replace("T", " ");
    lines.push(`--- ${post.author.name} [${date}] ---`);
    lines.push(post.markdown);

    for (const { node: comment } of post.comments.edges) {
      const cDate = new Date(comment.created).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`  > ${comment.author.name} [${cDate}]:`);
      lines.push(`  ${comment.markdown}`);

      for (const { node: reply } of comment.replies.edges) {
        const rDate = new Date(reply.created).toISOString().slice(0, 16).replace("T", " ");
        lines.push(`    >> ${reply.author.name} [${rDate}]:`);
        lines.push(`    ${reply.markdown}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { group?: string; week?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { group, week } = body;
  if (!group || typeof group !== "string") {
    return NextResponse.json({ error: "group is required" }, { status: 400 });
  }
  if (!week || !/^(current|previous|week\d{2})$/.test(week)) {
    return NextResponse.json({ error: "week must be 'current', 'previous', or 'weekXX'" }, { status: 400 });
  }

  // Resolve group from DB
  const groups = await getGroups();
  const dbGroup = groups.find((g) => g.name === group);
  if (!dbGroup) {
    return NextResponse.json({ error: `Group '${group}' not found` }, { status: 404 });
  }

  const authToken = await getAuthToken(dbGroup.authToken);
  if (!authToken) {
    return NextResponse.json({ error: `Auth token '${dbGroup.authToken}' not found` }, { status: 500 });
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return NextResponse.json({ error: "SLASHWORK_GRAPHQL_URL not configured" }, { status: 500 });
  }

  // Fetch posts from Slashwork
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      query: FETCH_POSTS_QUERY,
      variables: { groupId: dbGroup.slashworkId, first: 100 },
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Slashwork API error: ${response.status}` },
      { status: 502 },
    );
  }

  const result = (await response.json()) as FetchResponse;
  if (result.errors?.length) {
    return NextResponse.json(
      { error: `GraphQL error: ${result.errors.map((e) => e.message).join(", ")}` },
      { status: 502 },
    );
  }

  // Filter posts by week
  const { start, end, label } = computeWeekRange(week);
  const allPosts = result.data?.fetch__Group?.posts?.edges?.map((e) => e.node) ?? [];
  const weekPosts = allPosts.filter((p) => p.created >= start && p.created <= end);

  if (weekPosts.length === 0) {
    return NextResponse.json({
      summary: `No posts found in '${group}' for ${label}.`,
      postCount: 0,
      weekLabel: label,
    });
  }

  // Format and summarize
  const formatted = formatPosts(weekPosts);
  const anthropic = getAnthropicClient();

  const aiResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Summarize the following messages from the '${group}' group for ${label}. Give a concise overview of the key topics, decisions, and action items discussed:\n\n${formatted}`,
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
}
