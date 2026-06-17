import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthToken } from "@/src/db";
import { postToSlashwork } from "@/src/slashwork";
import { apiError } from "@/src/api-error";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: { targetGroupId?: string; authTokenName?: string; markdown?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", "INVALID_JSON", 400);
  }

  const { targetGroupId, authTokenName, markdown } = body;
  if (!targetGroupId || !authTokenName || !markdown) {
    return apiError(
      "targetGroupId, authTokenName, and markdown are required",
      "MISSING_FIELDS",
      400,
    );
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return apiError("SLASHWORK_GRAPHQL_URL not configured", "MISSING_CONFIG", 500);
  }

  // Resolve auth token
  const token = await getAuthToken(authTokenName);
  if (!token) {
    return apiError(`Auth token '${authTokenName}' not found`, "AUTH_TOKEN_NOT_FOUND", 404);
  }

  try {
    await postToSlashwork(
      { graphqlUrl, authToken: token },
      targetGroupId,
      markdown,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(`Publish failed: ${message}`, "PUBLISH_FAILED", 502);
  }
}
