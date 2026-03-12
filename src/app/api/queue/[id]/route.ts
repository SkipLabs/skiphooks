import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { updateQueueItem } from "@/src/lib/db/repository";
import type { QueueItemStatus } from "@/src/types/storage";

const VALID_STATUSES = new Set<QueueItemStatus>([
  "pending",
  "replied",
  "dismissed",
  "snoozed",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const hasStatus = body.status !== undefined;
  const hasNotes = typeof body.notes === "string";

  if (!hasStatus && !hasNotes) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 }
    );
  }

  if (hasStatus && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `Invalid status: ${body.status}` },
      { status: 400 }
    );
  }

  try {
    const item = await updateQueueItem(id, {
      status: hasStatus ? body.status : undefined,
      notes: hasNotes ? body.notes : undefined,
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error(`Failed to update queue item ${id}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
