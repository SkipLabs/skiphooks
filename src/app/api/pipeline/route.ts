import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getScoutWarnings } from "@/src/lib/config";
import { startNewRun } from "@/src/lib/pipeline/lifecycle";
import type { RunOptions } from "@/src/lib/pipeline/runner";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const warnings = getScoutWarnings();
  if (warnings.length > 0) {
    const missing = warnings.map((w) => w.variable).join(", ");
    return NextResponse.json(
      { error: `Pipeline cannot run — missing env vars: ${missing}` },
      { status: 503 }
    );
  }

  let options: Omit<RunOptions, "signal"> | undefined;
  try {
    const body = await request.json();
    options = {
      subreddits: body.subreddits,
      maxPosts: body.maxPosts,
      dryRun: body.dryRun,
    };
  } catch {
    // No body or invalid JSON — run with defaults
  }

  try {
    const result = await startNewRun(options);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Pipeline run failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
