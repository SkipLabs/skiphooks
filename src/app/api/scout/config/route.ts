import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { loadPipelineConfig, hasDatabase } from "@/src/lib/config";
import { upsertScoutConfig } from "@/src/lib/db/repository";
import { abortCurrentRun, startNewRun } from "@/src/lib/pipeline/lifecycle";
import type { ScoutConfigInput } from "@/src/types/storage";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await loadPipelineConfig();
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const errors = validateConfigInput(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  const input = body as ScoutConfigInput;
  const saved = await upsertScoutConfig(input);

  // Abort current pipeline run and start fresh with new config
  abortCurrentRun();
  startNewRun().catch((err) => {
    console.error("Pipeline restart after config update failed:", err);
  });

  return NextResponse.json(saved);
}

function validateConfigInput(body: unknown): string[] {
  const errors: string[] = [];
  if (!body || typeof body !== "object") {
    return ["Request body must be an object"];
  }

  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.subreddits) || b.subreddits.length === 0) {
    errors.push("subreddits must be a non-empty array");
  } else if (!b.subreddits.every((s: unknown) => typeof s === "string" && s.length > 0)) {
    errors.push("each subreddit must be a non-empty string");
  }

  if (typeof b.topicDescription !== "string" || b.topicDescription.length === 0) {
    errors.push("topicDescription must be a non-empty string");
  }

  if (typeof b.replyPersona !== "string" || b.replyPersona.length === 0) {
    errors.push("replyPersona must be a non-empty string");
  }

  if (typeof b.threadThreshold !== "number" || b.threadThreshold < 0 || b.threadThreshold > 1) {
    errors.push("threadThreshold must be a number between 0 and 1");
  }

  if (typeof b.commentThreshold !== "number" || b.commentThreshold < 0 || b.commentThreshold > 1) {
    errors.push("commentThreshold must be a number between 0 and 1");
  }

  if (typeof b.rateLimitMs !== "number" || !Number.isInteger(b.rateLimitMs) || b.rateLimitMs <= 0) {
    errors.push("rateLimitMs must be a positive integer");
  }

  if (typeof b.pollIntervalMs !== "number" || !Number.isInteger(b.pollIntervalMs) || b.pollIntervalMs <= 0) {
    errors.push("pollIntervalMs must be a positive integer");
  }

  return errors;
}
