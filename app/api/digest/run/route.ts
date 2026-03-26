import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthToken, getAuthTokens } from "@/src/db";
import { generateDigest, computeDigestWindow } from "@/src/weekly-digest";
import { apiError } from "@/src/api-error";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: { start?: string; end?: string; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", "INVALID_JSON", 400);
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return apiError("SLASHWORK_GRAPHQL_URL not configured", "MISSING_CONFIG", 500);
  }

  // Get an auth token for API calls
  const authTokens = await getAuthTokens();
  if (authTokens.length === 0) {
    return apiError("No auth tokens configured", "NO_AUTH_TOKENS", 500);
  }
  const token = await getAuthToken(authTokens[0]!.name);
  if (!token) {
    return apiError("Failed to load auth token", "AUTH_TOKEN_ERROR", 500);
  }

  // Use provided window or default to last Thursday-Thursday
  const window = body.start && body.end
    ? { start: body.start, end: body.end, label: `${body.start} to ${body.end}` }
    : computeDigestWindow();

  try {
    const result = await generateDigest(
      graphqlUrl,
      token,
      window.start,
      window.end,
      body.prompt,
      (level, msg) => console.log(`[${level}] ${msg}`),
    );

    return NextResponse.json({
      markdown: result.markdown,
      groupCount: result.groupCount,
      totalPosts: result.totalPosts,
      window: { start: window.start, end: window.end, label: window.label },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(`Digest generation failed: ${message}`, "DIGEST_FAILED", 502);
  }
}
