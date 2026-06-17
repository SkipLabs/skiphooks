import { test, expect, mock, describe, beforeEach, afterEach } from "bun:test";

// ---- Mocks ---------------------------------------------------------------

let authUserId: string | null = "user-1";
mock.module("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: authUserId }),
}));

const summarizeMock = mock((_prompt: string, _maxTokens: number) => Promise.resolve("AI SUMMARY"));
mock.module("@/src/anthropic", () => ({
  summarize: summarizeMock,
}));

// Group lookups: no configured groups → falls back to first auth token
mock.module("@/src/db", () => ({
  getGroups: () => Promise.resolve([]),
  getAuthTokens: () => Promise.resolve([{ name: "t1", tokenPreview: "tok…" }]),
  getAuthToken: () => Promise.resolve("auth-token-value"),
}));

let groupPosts: unknown[] = [];
let formattedPosts = "FORMATTED POSTS";
mock.module("@/src/summary-utils", () => ({
  fetchGroupPosts: () => Promise.resolve(groupPosts),
  formatPosts: () => formattedPosts,
}));

let repoActivity = { mergedPRs: [], openedPRs: [], releases: [], commits: [] };
mock.module("@/src/github-utils", () => ({
  fetchRepoActivity: () => Promise.resolve(repoActivity),
  formatRepoActivity: () => "No activity found for this period.",
}));

process.env.SLASHWORK_GRAPHQL_URL = "https://gql.example.com";
process.env.ANTHROPIC_API_KEY = "test-key";

import { POST } from "@/app/api/summary/route";

function req(body: unknown): Request {
  return new Request("https://example.com/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authUserId = "user-1";
  groupPosts = [];
  formattedPosts = "FORMATTED POSTS";
  repoActivity = { mergedPRs: [], openedPRs: [], releases: [], commits: [] };
  summarizeMock.mockClear();
});

afterEach(() => {
  summarizeMock.mockClear();
});

describe("POST /api/summary — auth & validation (apiError shape)", () => {
  test("returns a typed UNAUTHORIZED error when not signed in", async () => {
    authUserId = null;
    const res = await POST(req({ week: "current", groupId: "g1" }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string; code: string };
    expect(json.code).toBe("UNAUTHORIZED");
    expect(json.error).toBe("Unauthorized");
  });

  test("returns a typed INVALID_WEEK error for a bad week", async () => {
    const res = await POST(req({ week: "lastyear", groupId: "g1" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("INVALID_WEEK");
  });

  test("returns MISSING_SOURCE when neither group nor repo is given", async () => {
    const res = await POST(req({ week: "current" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("MISSING_SOURCE");
  });
});

describe("POST /api/summary — empty-content detection", () => {
  test("returns the no-activity response and skips the AI call when there is nothing", async () => {
    groupPosts = []; // no posts, no repo
    const res = await POST(req({ week: "current", groupId: "g1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { summary: string; postCount: number };
    expect(json.postCount).toBe(0);
    expect(json.summary).toContain("No activity found");
    expect(summarizeMock).not.toHaveBeenCalled();
  });

  test("repo with no activity alone is treated as empty", async () => {
    // formatRepoActivity returns text containing 'No activity', activity arrays empty
    const res = await POST(req({ week: "current", repo: "owner/repo" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { postCount: number; summary: string };
    expect(json.postCount).toBe(0);
    expect(summarizeMock).not.toHaveBeenCalled();
  });

  test("posts whose text contains 'No activity' still count as content", async () => {
    // Regression guard: the old magic-string check would mis-classify this as empty.
    groupPosts = [{ id: "p1" }];
    formattedPosts = "Alice: there was No activity on the deploy front this week";
    const res = await POST(req({ week: "current", groupId: "g1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { summary: string; postCount: number };
    expect(json.postCount).toBe(1);
    expect(json.summary).toBe("AI SUMMARY");
    expect(summarizeMock).toHaveBeenCalledTimes(1);
  });
});
