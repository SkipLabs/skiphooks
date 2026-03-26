import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDigestConfig, upsertDigestConfig } from "@/src/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getDigestConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { targetGroupId?: string; authToken?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { targetGroupId, authToken, enabled } = body;
  if (!targetGroupId || !authToken || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "targetGroupId, authToken, and enabled are required" },
      { status: 400 },
    );
  }

  await upsertDigestConfig(targetGroupId, authToken, enabled);
  const config = await getDigestConfig();
  return NextResponse.json({ config });
}
