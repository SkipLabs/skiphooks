import { test, expect, describe, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { setupTestDb, truncateTables, teardownTestDb } from "@/tests/helpers/db";
import { makeRedditListing, makeRedditCommentNode } from "@/tests/helpers/factories";
import type postgres from "postgres";

const hasTestDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasTestDb)("Queue Workflow E2E", () => {
  let testSql: postgres.Sql;

  const mockRedditFetch = mock(() => Promise.resolve([] as unknown));
  const mockAnthropicCreate = mock(() =>
    Promise.resolve({ content: [{ type: "text", text: "[]" }] })
  );
  const mockAuth = mock(() => Promise.resolve({ userId: "e2e-user" }));

  beforeAll(async () => {
    testSql = await setupTestDb();

    mock.module("@/src/lib/reddit/client", () => ({
      getAccessToken: () => Promise.resolve("fake-token"),
      redditFetch: mockRedditFetch,
    }));

    mock.module("@/src/lib/db/client", () => ({
      getDb: () => testSql,
    }));

    mock.module("@/src/lib/config", () => ({
      config: {
        reddit: {
          clientId: "x",
          clientSecret: "x",
          userAgent: "test",
          rateLimitMs: 0,
        },
        anthropic: { apiKey: "x", model: "test" },
        scoring: {
          topicDescription: "SkipLabs tools",
          replyPersona: "We build Skipper",
          threadThreshold: 0.5,
          commentThreshold: 0.6,
        },
        db: { url: process.env.TEST_DATABASE_URL },
        pipeline: {
          subreddits: ["programming"],
          batchSize: 20,
          maxCommentsPerThread: 100,
          pollIntervalMs: 60000,
        },
      },
    }));

    mock.module("@/src/lib/scoring/client", () => ({
      getAnthropicClient: () => ({
        messages: { create: mockAnthropicCreate },
      }),
    }));

    mock.module("@clerk/nextjs/server", () => ({
      auth: mockAuth,
    }));
  });

  beforeEach(async () => {
    await truncateTables(testSql);
    mockRedditFetch.mockReset();
    mockAnthropicCreate.mockReset();
  });

  afterAll(async () => {
    if (testSql) await teardownTestDb(testSql);
  });

  async function seedPipeline() {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    // Mock Reddit API
    mockRedditFetch.mockResolvedValueOnce(
      makeRedditListing([{ id: "wf-p1" }, { id: "wf-p2" }])
    );

    // Thread scoring - both pass
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              postId: "wf-p1",
              verdict: "dive_in",
              relevanceScore: 0.8,
              reasoning: "R",
              suggestedTopics: [],
            },
            {
              postId: "wf-p2",
              verdict: "dive_in",
              relevanceScore: 0.7,
              reasoning: "R",
              suggestedTopics: [],
            },
          ]),
        },
      ],
    });

    // Comment fetch for wf-p1
    const c1 = makeRedditCommentNode({
      id: "wf-c1",
      body: "First comment",
      parent_id: "t3_wf-p1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValueOnce([
      {
        data: {
          children: [
            {
              data: {
                id: "wf-p1",
                title: "Post 1",
                permalink: "/r/programming/comments/wf-p1/test/",
                subreddit: "programming",
                score: 10,
                num_comments: 1,
                selftext: "Body 1",
                author: "op1",
                created_utc: 1700000000,
              },
            },
          ],
        },
      },
      { data: { children: [c1] } },
    ]);

    // Comment scoring for wf-p1
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              commentId: "wf-c1",
              verdict: "reply_worthy",
              relevanceScore: 0.9,
              reasoning: "Good opportunity",
              replyAngle: "Mention product",
              urgency: "high",
            },
          ]),
        },
      ],
    });

    // Comment fetch for wf-p2
    const c2 = makeRedditCommentNode({
      id: "wf-c2",
      body: "Second comment",
      parent_id: "t3_wf-p2",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValueOnce([
      {
        data: {
          children: [
            {
              data: {
                id: "wf-p2",
                title: "Post 2",
                permalink: "/r/programming/comments/wf-p2/test/",
                subreddit: "programming",
                score: 5,
                num_comments: 1,
                selftext: "Body 2",
                author: "op2",
                created_utc: 1700000000,
              },
            },
          ],
        },
      },
      { data: { children: [c2] } },
    ]);

    // Comment scoring for wf-p2
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              commentId: "wf-c2",
              verdict: "interesting",
              relevanceScore: 0.65,
              reasoning: "Worth watching",
              replyAngle: null,
              urgency: "low",
            },
          ]),
        },
      ],
    });

    await runPipeline();
  }

  test("GET /api/queue returns pipeline-created items", async () => {
    await seedPipeline();

    const { getQueue } = await import("@/src/lib/db/repository");
    const items = await getQueue();

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.commentId).sort()).toEqual(["wf-c1", "wf-c2"]);
  });

  test("GET with status filter works", async () => {
    await seedPipeline();

    const { getQueue } = await import("@/src/lib/db/repository");
    const items = await getQueue({ status: "pending" });

    expect(items).toHaveLength(2);
    items.forEach((item) => expect(item.status).toBe("pending"));
  });

  test("PATCH status=replied sets replied_at", async () => {
    await seedPipeline();

    const { getQueue, updateQueueItem } = await import(
      "@/src/lib/db/repository"
    );
    const items = await getQueue();
    const item = items[0]!;

    const updated = await updateQueueItem(item.id, { status: "replied" });

    expect(updated.status).toBe("replied");
    expect(updated.repliedAt).toBeInstanceOf(Date);
  });

  test("PATCH notes adds notes", async () => {
    await seedPipeline();

    const { getQueue, updateQueueItem } = await import(
      "@/src/lib/db/repository"
    );
    const items = await getQueue();
    const item = items[0]!;

    const updated = await updateQueueItem(
      item.id,
      { notes: "Replied with product link" }
    );

    expect(updated.notes).toBe("Replied with product link");
  });

  test("full lifecycle: create → fetch → dismiss → fetch shows updated", async () => {
    await seedPipeline();

    const { getQueue, updateQueueItem } = await import(
      "@/src/lib/db/repository"
    );

    // Step 1: Fetch all items
    const allItems = await getQueue();
    expect(allItems).toHaveLength(2);

    // Step 2: Dismiss one item
    const dismissed = await updateQueueItem(allItems[0]!.id, { status: "dismissed" });
    expect(dismissed.status).toBe("dismissed");

    // Step 3: Fetch pending only
    const pendingItems = await getQueue({ status: "pending" });
    expect(pendingItems).toHaveLength(1);

    // Step 4: Fetch dismissed only
    const dismissedItems = await getQueue({ status: "dismissed" });
    expect(dismissedItems).toHaveLength(1);
    expect(dismissedItems[0]!.id).toBe(allItems[0]!.id);
  });

  test("queue items have correct thread data", async () => {
    await seedPipeline();

    const { getQueue } = await import("@/src/lib/db/repository");
    const items = await getQueue();

    for (const item of items) {
      expect(item.thread).toBeDefined();
      expect(item.thread.id).toBeTruthy();
      expect(item.thread.title).toBeTruthy();
      expect(item.thread.subreddit).toBe("programming");
    }
  });
});
