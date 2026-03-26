import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDigestConfig, getAuthToken, updateDigestLastRun } from "@/src/db";
import { postToSlashwork } from "@/src/slashwork";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { markdown?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.markdown) {
    return NextResponse.json({ error: "markdown is required" }, { status: 400 });
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return NextResponse.json({ error: "SLASHWORK_GRAPHQL_URL not configured" }, { status: 500 });
  }

  const config = await getDigestConfig();
  if (!config) {
    return NextResponse.json({ error: "Digest not configured. Set a target group first." }, { status: 400 });
  }

  const token = await getAuthToken(config.authToken);
  if (!token) {
    return NextResponse.json({ error: `Auth token '${config.authToken}' not found` }, { status: 500 });
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
    return NextResponse.json({ error: `Publish failed: ${message}` }, { status: 502 });
  }
}
