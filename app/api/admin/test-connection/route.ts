import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuthToken } from "@/src/db";
import { validateConnection } from "@/src/slashwork";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { authTokenName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.authTokenName) {
    return NextResponse.json({ error: "authTokenName is required" }, { status: 400 });
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    return NextResponse.json({ error: "SLASHWORK_GRAPHQL_URL not configured" }, { status: 500 });
  }

  const token = await getAuthToken(body.authTokenName);
  if (!token) {
    return NextResponse.json({ error: `Auth token "${body.authTokenName}" not found` }, { status: 404 });
  }

  try {
    await validateConnection({ graphqlUrl, authToken: token });
    return NextResponse.json({ ok: true, message: "Connection successful" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
