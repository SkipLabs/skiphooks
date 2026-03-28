import { getSkipBroker } from "@/src/skip/broker";

const RESOURCES = ["authTokens", "groups", "routes", "discoveredGroups"] as const;

export async function GET() {
  try {
    const broker = getSkipBroker();
    const uuids = await Promise.all(
      RESOURCES.map(async (resource) => {
        const uuid = await broker.getStreamUUID(resource, {});
        return [resource, `/api/skip/streams/${uuid}`] as const;
      }),
    );
    return Response.json({ streams: Object.fromEntries(uuids) });
  } catch (error) {
    console.error("[SKIP] Failed to get batch stream UUIDs:", error);
    return Response.json(
      { error: "Failed to create streams" },
      { status: 500 },
    );
  }
}
