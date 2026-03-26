import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createRoute, deleteRoute } from "@/src/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; groupName?: string; streamId?: string; authToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!body.groupName && !body.streamId) {
    return NextResponse.json({ error: "Either groupName or streamId is required" }, { status: 400 });
  }

  if (body.groupName && body.streamId) {
    return NextResponse.json({ error: "Cannot set both groupName and streamId" }, { status: 400 });
  }

  if (body.streamId && !body.authToken) {
    return NextResponse.json({ error: "authToken is required for stream-based routes" }, { status: 400 });
  }

  try {
    await createRoute(body.name, {
      groupName: body.groupName,
      streamId: body.streamId,
      authToken: body.authToken,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key") || message.includes("unique")) {
      return NextResponse.json({ error: "Route with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const deleted = await deleteRoute(name);
  if (!deleted) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
