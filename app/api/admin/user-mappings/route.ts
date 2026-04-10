import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUserMappings, upsertUserMapping, deleteUserMapping } from "@/src/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mappings = await getUserMappings();
  return NextResponse.json(mappings);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { githubUsername?: string; slashworkUsername?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.githubUsername || !body.slashworkUsername) {
    return NextResponse.json(
      { error: "githubUsername and slashworkUsername are required" },
      { status: 400 },
    );
  }

  try {
    await upsertUserMapping(body.githubUsername, body.slashworkUsername);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const githubUsername = searchParams.get("githubUsername");
  if (!githubUsername) {
    return NextResponse.json({ error: "githubUsername is required" }, { status: 400 });
  }

  try {
    const deleted = await deleteUserMapping(githubUsername);
    if (!deleted) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
