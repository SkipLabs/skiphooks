import { loadConfig, type EventType } from "./config.ts";
import { verifySignature } from "./webhook.ts";
import { postToSlashwork, type SlashworkConnection } from "./slashwork.ts";
import type { EventHandler } from "./handlers/types.ts";
import { pullRequestHandler } from "./handlers/pull-request.ts";
import { issuesHandler } from "./handlers/issues.ts";
import { pushHandler } from "./handlers/push.ts";
import { releaseHandler } from "./handlers/release.ts";

const config = loadConfig();
const port = parseInt(process.env.PORT || "3000", 10);

const connection: SlashworkConnection = {
  graphqlUrl: config.slashwork.graphqlUrl,
  accessToken: config.slashwork.accessToken,
};

const handlers: Record<EventType, EventHandler> = {
  pull_request: pullRequestHandler,
  issues: issuesHandler,
  push: pushHandler,
  release: releaseHandler,
};

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(body, signature, config.github.webhookSecret)) {
    log("warn", "Invalid webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const eventType = req.headers.get("x-github-event") as EventType | null;
  if (!eventType) {
    log("info", "Missing x-github-event header");
    return new Response("OK");
  }

  const route = config.routes[eventType];
  if (!route) {
    log("info", `No route configured for event: ${eventType}`);
    return new Response("OK");
  }

  const handler = handlers[eventType];
  if (!handler) {
    log("info", `No handler for event: ${eventType}`);
    return new Response("OK");
  }

  let payload: { action?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    log("error", "Failed to parse webhook payload");
    return new Response("OK");
  }

  if (!handler.isRelevantAction(payload.action)) {
    log("info", `Ignoring ${eventType} action: ${payload.action}`);
    return new Response("OK");
  }

  try {
    const { markdown } = handler.format(payload);
    await postToSlashwork(connection, route.groupId, markdown);
    log("info", `Posted ${eventType} event: ${payload.action ?? "n/a"}`);
  } catch (err) {
    log("error", `Failed to post to Slashwork: ${err}`);
  }

  return new Response("OK");
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("OK");
    }

    if (url.pathname === "/github-webhook") {
      return handleWebhook(req);
    }

    return new Response("Not found", { status: 404 });
  },
});

log("info", `Server running on port ${port}`);
log("info", `Slashwork URL: ${config.slashwork.graphqlUrl}`);
log("info", `Access token loaded: ${config.slashwork.accessToken.slice(0, 8)}...`);
