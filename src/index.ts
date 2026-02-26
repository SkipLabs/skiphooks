import { verifySignature, getWebhookSecret } from "./webhook.ts";
import { formatPREvent, isRelevantAction } from "./formatter.ts";
import { getSlashworkConfig, postToSlashwork } from "./slashwork.ts";

const port = parseInt(process.env.PORT || "3000", 10);
const webhookSecret = getWebhookSecret();
const slashworkConfig = getSlashworkConfig();

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
  if (!verifySignature(body, signature, webhookSecret)) {
    log("warn", "Invalid webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    log("info", `Ignoring event: ${event}`);
    return new Response("OK");
  }

  let payload: { action: string; pull_request: unknown };
  try {
    payload = JSON.parse(body);
  } catch {
    log("error", "Failed to parse webhook payload");
    return new Response("OK");
  }

  const { action } = payload;
  if (!isRelevantAction(action)) {
    log("info", `Ignoring PR action: ${action}`);
    return new Response("OK");
  }

  try {
    const markdown = formatPREvent(
      payload as Parameters<typeof formatPREvent>[0],
    );
    await postToSlashwork(slashworkConfig, markdown);
    log("info", `Posted PR event: ${action}`);
  } catch (err) {
    log("error", `Failed to post to Slashwork: ${err}`);
  }

  // Always return 200 to GitHub to avoid retries
  return new Response("OK");
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("OK");
    }

    if (url.pathname === "/github-webhook") {
      return handleWebhook(req);
    }

    return new Response("Not found", { status: 404 });
  },
});

log("info", `Server running on port ${port}`);
