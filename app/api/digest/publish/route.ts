import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDigestConfig, getAuthToken, updateDigestLastRun } from "@/src/db";
import { postToSlashwork } from "@/src/slashwork";
import { apiError } from "@/src/api-error";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: { markdown?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", "INVALID_JSON", 400);
  }

  if (!body.markdown) {
    return apiError("markdown is required", "MISSING_FIELDS", 400);
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return apiError("SLASHWORK_GRAPHQL_URL not configured", "MISSING_CONFIG", 500);
  }

  const config = await getDigestConfig();
  if (!config) {
    return apiError("Digest not configured. Set a target group first.", "DIGEST_NOT_CONFIGURED", 400);
  }

  const token = await getAuthToken(config.authToken);
  if (!token) {
    return apiError(`Auth token '${config.authToken}' not found`, "AUTH_TOKEN_ERROR", 500);
  }

  try {
    await postToSlashwork(
      { graphqlUrl, authToken: token },
      config.targetGroupId,
      body.markdown,
    );
    await updateDigestLastRun();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiError(`Publish failed: ${message}`, "PUBLISH_FAILED", 502);
  }
}
