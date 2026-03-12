import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getQueue } from "@/src/lib/db/repository";
import type { QueueFilter, QueueItemStatus, Urgency } from "@/src/types/storage";

const VALID_STATUSES = new Set<QueueItemStatus>(["pending", "replied", "dismissed", "snoozed"]);
const VALID_URGENCIES = new Set<Urgency>(["high", "medium", "low"]);

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const filter: QueueFilter = {};
  const status = searchParams.get("status");
  if (status) {
    if (!VALID_STATUSES.has(status as QueueItemStatus)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }
    filter.status = status as QueueItemStatus;
  }

  const urgency = searchParams.get("urgency");
  if (urgency) {
    if (!VALID_URGENCIES.has(urgency as Urgency)) {
      return NextResponse.json({ error: `Invalid urgency: ${urgency}` }, { status: 400 });
    }
    filter.urgency = urgency as Urgency;
  }

  const subreddit = searchParams.get("subreddit");
  if (subreddit) filter.subreddit = subreddit;

  const minScore = searchParams.get("minScore");
  if (minScore) {
    const parsed = parseFloat(minScore);
    if (isNaN(parsed)) {
      return NextResponse.json({ error: "Invalid minScore value" }, { status: 400 });
    }
    filter.minScore = parsed;
  }

  try {
    const items = await getQueue(filter);
    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to fetch queue:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
