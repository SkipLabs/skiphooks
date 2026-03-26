import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAuthToken, deleteAuthToken } from "@/src/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || !body.token) {
    return NextResponse.json({ error: "name and token are required" }, { status: 400 });
  }

  try {
    await createAuthToken(body.name, body.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key") || message.includes("unique")) {
      return NextResponse.json({ error: "Token with this name already exists" }, { status: 409 });
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

  try {
    const deleted = await deleteAuthToken(name);
    if (!deleted) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("foreign key") || message.includes("violates")) {
      return NextResponse.json({ error: "Token is in use by a group or route" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
