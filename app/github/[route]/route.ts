import { getAppConfig, type EventType } from "@/src/config";
import { resolveRouteFromDb } from "@/src/db";
import { verifySignature } from "@/src/webhook";
import { postToSlashwork, type SlashworkConnection } from "@/src/slashwork";
import type { EventHandler } from "@/src/handlers/types";
import { pullRequestHandler } from "@/src/handlers/pull-request";
import { issuesHandler } from "@/src/handlers/issues";
import { pushHandler } from "@/src/handlers/push";
import { issueCommentHandler } from "@/src/handlers/issue-comment";
import { releaseHandler } from "@/src/handlers/release";
import { workflowRunHandler } from "@/src/handlers/workflow-run";
import { deploymentStatusHandler } from "@/src/handlers/deployment-status";
import { pullRequestReviewHandler } from "@/src/handlers/pull-request-review";
import { checkSuiteHandler } from "@/src/handlers/check-suite";

export const dynamic = "force-dynamic";

const handlers: Partial<Record<EventType, EventHandler>> = {
  pull_request: pullRequestHandler,
  issues: issuesHandler,
  issue_comment: issueCommentHandler,
  push: pushHandler,
  release: releaseHandler,
  workflow_run: workflowRunHandler,
  deployment_status: deploymentStatusHandler,
  pull_request_review: pullRequestReviewHandler,
  check_suite: checkSuiteHandler,
};

function log(level: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ route: string }> },
) {
  const config = getAppConfig();

  // Read body immediately — the stream gets locked if we await other async work first
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { route: routeName } = await params;

  // Verify the signature before any DB work — verification is pure CPU and
  // needs only the body + secret, so forged requests are rejected without
  // touching the database (avoids an unauthenticated DB-load vector).
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(body, signature, config.github.webhookSecret)) {
    log("warn", `Invalid webhook signature for route "${routeName}" (signature: ${signature ? `"${signature.slice(0, 20)}..."` : "missing"}, body length: ${body.length})`);
    return new Response("Invalid signature", { status: 401 });
  }

  const resolved = await resolveRouteFromDb(routeName);
  if (!resolved) {
    log("warn", `No route configured for: ${routeName}`);
    return new Response("Not found", { status: 404 });
  }

  const { targetId, authToken } = resolved;
  const connection: SlashworkConnection = {
    graphqlUrl: config.slashwork.graphqlUrl,
    authToken,
  };

  const eventType = request.headers.get("x-github-event") as EventType | null;
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
