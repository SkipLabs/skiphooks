import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDigestConfig, upsertDigestConfig } from "@/src/db";
import { apiError } from "@/src/api-error";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  const config = await getDigestConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError("Unauthorized", "UNAUTHORIZED", 401);
  }

  let body: { targetGroupId?: string; authToken?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON", "INVALID_JSON", 400);
  }

  const { targetGroupId, authToken, enabled } = body;
  if (!targetGroupId || !authToken || typeof enabled !== "boolean") {
    return apiError(
      "targetGroupId, authToken, and enabled are required",
      "MISSING_FIELDS",
      400,
    );
  }

  await upsertDigestConfig(targetGroupId, authToken, enabled);
  const config = await getDigestConfig();
  return NextResponse.json({ config });
}
