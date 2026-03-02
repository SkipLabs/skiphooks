import { loadConfig, type EventType } from "./config.ts";
import { verifySignature } from "./webhook.ts";
import { postToSlashwork, validateConnection, type SlashworkConnection } from "./slashwork.ts";
import type { EventHandler } from "./handlers/types.ts";
import { pullRequestHandler } from "./handlers/pull-request.ts";
import { issuesHandler } from "./handlers/issues.ts";
import { pushHandler } from "./handlers/push.ts";
import { issueCommentHandler } from "./handlers/issue-comment.ts";
import { releaseHandler } from "./handlers/release.ts";

const config = loadConfig();
const port = parseInt(process.env.PORT || "3000", 10);

function resolveRoute(routeName: string): { targetId: string; authToken: string } {
  const route = config.routes[routeName]!;
  if ("group" in route) {
    const group = config.groups![route.group]!;
    return { targetId: group.id, authToken: group.authToken };
  }
  return { targetId: route.streamId, authToken: route.authToken };
}

function connectionForRoute(routeName: string): SlashworkConnection {
  const { authToken } = resolveRoute(routeName);
  return {
    graphqlUrl: config.slashwork.graphqlUrl,
    authToken,
  };
}

const handlers: Record<EventType, EventHandler> = {
  pull_request: pullRequestHandler,
  issues: issuesHandler,
  issue_comment: issueCommentHandler,
  push: pushHandler,
  release: releaseHandler,
};

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

async function handleWebhook(req: Request, routeName: string): Promise<Response> {
  const { targetId } = resolveRoute(routeName);
  const connection = connectionForRoute(routeName);
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
    log("warn", `Invalid webhook signature for route "${routeName}" (signature: ${signature ? `"${signature.slice(0, 20)}..."` : "missing"}, body length: ${body.length})`);
    return new Response("Invalid signature", { status: 401 });
  }

  const eventType = req.headers.get("x-github-event") as EventType | null;
  if (!eventType) {
    log("info", "Missing x-github-event header");
    return new Response("OK");
  }

  const handler = handlers[eventType];
  if (!handler) {
    log("info", `No handler for event: ${eventType}`);
    return new Response("OK");
  }

  let payload: { action?: string };
  try {
    const json = body.startsWith("payload=")
      ? decodeURIComponent(body.slice("payload=".length))
      : body;
    payload = JSON.parse(json);
  } catch (err) {
    log("error", `Failed to parse ${eventType} payload: ${err} (body length: ${body.length})`);
    return new Response("OK");
  }

  if (!handler.isRelevantAction(payload.action)) {
    log("info", `Ignoring ${eventType} action: ${payload.action}`);
    return new Response("OK");
  }

  try {
    const { markdown } = handler.format(payload);
    await postToSlashwork(connection, targetId, markdown);
    log("info", `Posted ${eventType} event: ${payload.action ?? "n/a"}`);
  } catch (err) {
    log("error", `Failed to post to Slashwork: ${err}`);
  }

  return new Response("OK");
}

Bun.serve({
  port,
  maxRequestBodySize: 1024 * 1024,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405 });
      }
      return new Response("OK");
    }

    const match = url.pathname.match(/^\/github\/([^/]+)$/);
    if (match) {
      const name = match[1]!;
      const route = config.routes[name];
      if (!route) {
        log("warn", `No route configured for: ${name}`);
        return new Response("Not found", { status: 404 });
      }
      return handleWebhook(req, name);
    }

    return new Response("Not found", { status: 404 });
  },
});

const routeNames = Object.keys(config.routes);
log("info", `Server running on port ${port}`);
log("info", `Routes: ${routeNames.map(n => `/github/${n}`).join(", ")}`);
log("info", `Slashwork URL: ${config.slashwork.graphqlUrl}`);

for (const name of routeNames) {
  const conn = connectionForRoute(name);
  log("info", `Route ${name}: auth token configured`);
  validateConnection(conn).then(
    () => log("info", `Route ${name}: auth validated`),
    (err) => log("error", `Route ${name}: ${err}`),
  );
}
