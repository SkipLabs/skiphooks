import { NextRequest } from "next/server";
import { getSkipBroker } from "@/src/skip/broker";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEARTBEAT_INTERVAL_MS = 30_000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;

  if (!UUID_RE.test(uuid)) {
    return Response.json({ error: "Invalid stream UUID" }, { status: 400 });
  }

  const skipStreamingPort = parseInt(
    process.env.SKIP_STREAMING_PORT || "8079",
    10,
  );
  const skipUrl = `http://localhost:${skipStreamingPort}/v1/streams/${uuid}`;

  try {
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(skipUrl, { signal: controller.signal });
    clearTimeout(connectTimeout);

    if (!response.ok || !response.body) {
      return Response.json(
        { error: `Skip service error: ${response.status}` },
        { status: 502 },
      );
    }

    const skipBody = response.body;
    const broker = getSkipBroker();

    let uuidDeleted = false;
    const deleteUUID = () => {
      if (!uuidDeleted) {
        uuidDeleted = true;
        broker.deleteUUID(uuid).catch(() => {});
      }
    };

    const stream = new ReadableStream({
      async start(streamController) {
        const encoder = new TextEncoder();

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
          try {
            streamController.enqueue(
              encoder.encode(
                `event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`,
              ),
            );
          } catch {
            clearInterval(heartbeat);
          }
        }, HEARTBEAT_INTERVAL_MS);

        const reader = skipBody.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            streamController.enqueue(value);
          }
        } catch {
          // Stream closed (client disconnect or Skip error)
        } finally {
          clearInterval(heartbeat);
          reader.releaseLock();
          try {
            streamController.close();
          } catch {
            // Already closed
          }
          deleteUUID();
        }
      },
      cancel() {
        skipBody.cancel().catch(() => {});
        deleteUUID();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[SKIP] Proxy error:", error);
    return Response.json(
      { error: "Failed to proxy stream" },
      { status: 502 },
    );
  }
}
