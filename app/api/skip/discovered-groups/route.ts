import { getSkipBroker } from "@/src/skip/broker";

export async function GET() {
  try {
    const broker = getSkipBroker();
    const uuid = await broker.getStreamUUID("discoveredGroups", {});
    return Response.json({ streamUrl: `/api/skip/streams/${uuid}` });
  } catch (error) {
    console.error("[SKIP] Failed to get stream UUID:", error);
    return Response.json(
      { error: "Failed to create stream" },
      { status: 500 },
    );
  }
}
