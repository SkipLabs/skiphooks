import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthToken } from "@/src/db";
import { postToSlashwork } from "@/src/slashwork";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { targetGroupId?: string; authTokenName?: string; markdown?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { targetGroupId, authTokenName, markdown } = body;
  if (!targetGroupId || !authTokenName || !markdown) {
    return NextResponse.json(
      { error: "targetGroupId, authTokenName, and markdown are required" },
      { status: 400 },
    );
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return NextResponse.json({ error: "SLASHWORK_GRAPHQL_URL not configured" }, { status: 500 });
  }

  // Resolve auth token
  const token = await getAuthToken(authTokenName);
  if (!token) {
    return NextResponse.json({ error: `Auth token '${authTokenName}' not found` }, { status: 404 });
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
    return NextResponse.json({ error: `Publish failed: ${message}` }, { status: 502 });
  }
}
