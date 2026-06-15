import { test, expect, mock, describe, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";

const WEBHOOK_SECRET = "test-webhook-secret";
const GRAPHQL_URL = "https://slashwork.example.com/graphql";
const TARGET_ID = "group-xyz";
const AUTH_TOKEN = "sw-token-abc";

// Mutable references so individual tests can override return values
let resolveRoute: () => Promise<{ targetId: string; authToken: string } | null> = () =>
  Promise.resolve({ targetId: TARGET_ID, authToken: AUTH_TOKEN });

const postToSlashworkMock = mock(
  (_connection: unknown, _streamId: string, _markdown: string) => Promise.resolve()
);

mock.module("@/src/db", () => ({
  resolveRouteFromDb: (_routeName: string) => resolveRoute(),
}));

mock.module("@/src/slashwork", () => ({
  postToSlashwork: postToSlashworkMock,
}));

process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SLASHWORK_GRAPHQL_URL = GRAPHQL_URL;

import { POST } from "@/app/github/[route]/route";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`;
}

function makeCtx(routeName = "skipper") {
  return { params: Promise.resolve({ route: routeName }) };
}

function makeRequest(body: string, eventType: string, sig?: string): Request {
  return new Request("https://example.com/github/skipper", {
    method: "POST",
    headers: {
      "x-hub-signature-256": sig ?? sign(body),
      "x-github-event": eventType,
      "content-type": "application/json",
    },
    body,
  });
}

afterEach(() => {
  resolveRoute = () => Promise.resolve({ targetId: TARGET_ID, authToken: AUTH_TOKEN });
  postToSlashworkMock.mockClear();
});

describe("POST /github/[route]", () => {
  test("returns 404 when route is not found in DB", async () => {
    resolveRoute = () => Promise.resolve(null);
    const body = JSON.stringify({ action: "opened" });
    const res = await POST(makeRequest(body, "pull_request"), makeCtx());
    expect(res.status).toBe(404);
    expect(postToSlashworkMock).not.toHaveBeenCalled();
  });

  test("returns 401 on invalid HMAC signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const res = await POST(makeRequest(body, "pull_request", "sha256=badsignature"), makeCtx());
    expect(res.status).toBe(401);
    expect(postToSlashworkMock).not.toHaveBeenCalled();
  });

  test("returns 200 and posts to Slashwork for a valid PR opened event", async () => {
    const payload = {
      action: "opened",
      pull_request: {
        number: 1,
        title: "My PR",
        html_url: "https://github.com/org/repo/pull/1",
        user: { login: "alice" },
        head: { ref: "feature" },
        base: { ref: "main" },
      },
      repository: { full_name: "org/repo" },
    };
    const body = JSON.stringify(payload);
    const res = await POST(makeRequest(body, "pull_request"), makeCtx());
    expect(res.status).toBe(200);
    expect(postToSlashworkMock).toHaveBeenCalledTimes(1);
    const call = postToSlashworkMock.mock.calls[0] as unknown as [{ graphqlUrl: string; authToken: string }, string, string];
    if (!call) throw new Error("postToSlashwork not called");
    const [connection, streamId] = call;
    expect(connection.authToken).toBe(AUTH_TOKEN);
    expect(streamId).toBe(TARGET_ID);
  });

  test("returns 200 without posting for an unknown event type", async () => {
    const body = JSON.stringify({ action: "opened" });
    const res = await POST(makeRequest(body, "unknown_event"), makeCtx());
    expect(res.status).toBe(200);
    expect(postToSlashworkMock).not.toHaveBeenCalled();
  });

  test("returns 200 without posting for an irrelevant PR action", async () => {
    const body = JSON.stringify({ action: "labeled" });
    const res = await POST(makeRequest(body, "pull_request"), makeCtx());
    expect(res.status).toBe(200);
    expect(postToSlashworkMock).not.toHaveBeenCalled();
  });

  test("parses form-encoded payload= body", async () => {
    const payload = {
      action: "opened",
      pull_request: {
        number: 2,
        title: "Form encoded PR",
        html_url: "https://github.com/org/repo/pull/2",
        user: { login: "bob" },
        head: { ref: "fix" },
        base: { ref: "main" },
      },
      repository: { full_name: "org/repo" },
    };
    const encoded = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
    const res = await POST(makeRequest(encoded, "pull_request"), makeCtx());
    expect(res.status).toBe(200);
    expect(postToSlashworkMock).toHaveBeenCalledTimes(1);
  });

  test("returns 200 when Slashwork post fails (error is swallowed)", async () => {
    postToSlashworkMock.mockImplementation(() => Promise.reject(new Error("network down")));
    const payload = {
      action: "opened",
      pull_request: {
        number: 3,
        title: "PR that fails to post",
        html_url: "https://github.com/org/repo/pull/3",
        user: { login: "carol" },
        head: { ref: "branch" },
        base: { ref: "main" },
      },
      repository: { full_name: "org/repo" },
    };
    const body = JSON.stringify(payload);
    const res = await POST(makeRequest(body, "pull_request"), makeCtx());
    expect(res.status).toBe(200);
  });
});
