import { test, expect, describe, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { setupTestDb, truncateTables, teardownTestDb } from "@/tests/helpers/db";
import { makeRedditListing, makeRedditCommentNode } from "@/tests/helpers/factories";
import type postgres from "postgres";

const hasTestDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasTestDb)("Pipeline E2E", () => {
  let testSql: postgres.Sql;

  // Mock only external boundaries: Reddit API, Anthropic, Clerk auth
  const mockRedditFetch = mock((_url?: unknown) => Promise.resolve([] as unknown));
  const mockAnthropicCreate = mock(() =>
    Promise.resolve({ content: [{ type: "text", text: "[]" }] })
  );
  const mockAuth = mock(() => Promise.resolve({ userId: "e2e-user" }));

  beforeAll(async () => {
    testSql = await setupTestDb();

    // Mock external boundaries only
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
          topicDescription: "SkipLabs reactive data tools",
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

  function mockThreadScoring(results: unknown[]) {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(results) }],
    });
  }

  function mockCommentScoring(results: unknown[]) {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(results) }],
    });
  }

  function mockRedditPostFetch(posts: Array<{ id: string; subreddit?: string }>) {
    mockRedditFetch.mockResolvedValueOnce(makeRedditListing(posts));
  }

  function mockRedditCommentFetch(postId: string, comments: unknown[]) {
    mockRedditFetch.mockResolvedValueOnce([
      {
        data: {
          children: [
            {
              data: {
                id: postId,
                title: `Post ${postId}`,
                permalink: `/r/programming/comments/${postId}/test/`,
                subreddit: "programming",
                score: 42,
                num_comments: 10,
                selftext: "Body",
                author: "op",
                created_utc: 1700000000,
              },
            },
          ],
        },
      },
      { data: { children: comments } },
    ]);
  }

  test("runs full pipeline and returns RunResult", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "e2e-p1" }]);
    mockThreadScoring([
      {
        postId: "e2e-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "Relevant",
        suggestedTopics: ["ai"],
      },
    ]);

    const comment = makeRedditCommentNode({
      id: "e2e-c1",
      body: "Great discussion",
      parent_id: "t3_e2e-p1",
      depth: 0,
    });
    mockRedditCommentFetch("e2e-p1", [comment]);
    mockCommentScoring([
      {
        commentId: "e2e-c1",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Direct opportunity",
        replyAngle: "Mention Skipper",
        urgency: "high",
      },
    ]);

    const result = await runPipeline();

    expect(result.threadsScanned).toBe(1);
    expect(result.threadsSaved).toBe(1);
    expect(result.commentsSaved).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("threads stored in saved_threads (verify via DB query)", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "db-p1" }]);
    mockThreadScoring([
      {
        postId: "db-p1",
        verdict: "dive_in",
        relevanceScore: 0.75,
        reasoning: "R",
        suggestedTopics: ["tools"],
      },
    ]);
    mockRedditCommentFetch("db-p1", []);
    mockCommentScoring([]);

    await runPipeline();

    const rows = await testSql`SELECT * FROM saved_threads WHERE post_id = 'db-p1'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Post db-p1");
    expect(rows[0]!.relevance_score).toBeCloseTo(0.75);
  });

  test("queue items stored with correct thread_id FK", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "fk-p1" }]);
    mockThreadScoring([
      {
        postId: "fk-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      },
    ]);

    const comment = makeRedditCommentNode({
      id: "fk-c1",
      body: "Interesting",
      parent_id: "t3_fk-p1",
      depth: 0,
    });
    mockRedditCommentFetch("fk-p1", [comment]);
    mockCommentScoring([
      {
        commentId: "fk-c1",
        verdict: "interesting",
        relevanceScore: 0.7,
        reasoning: "Worth tracking",
        replyAngle: null,
        urgency: "medium",
      },
    ]);

    await runPipeline();

    const threads = await testSql`SELECT id FROM saved_threads WHERE post_id = 'fk-p1'`;
    const items = await testSql`SELECT * FROM queue_items WHERE comment_id = 'fk-c1'`;

    expect(items).toHaveLength(1);
    expect(items[0]!.thread_id).toBe(threads[0]!.id);
  });

  test("crawl_run created and completed with accurate stats", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "cr-p1" }, { id: "cr-p2" }]);
    mockThreadScoring([
      {
        postId: "cr-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      },
      {
        postId: "cr-p2",
        verdict: "skip",
        relevanceScore: 0.2,
        reasoning: "R",
        suggestedTopics: [],
      },
    ]);

    mockRedditCommentFetch("cr-p1", []);
    mockCommentScoring([]);

    await runPipeline();

    const runs = await testSql`SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT 1`;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.completed_at).not.toBeNull();
    expect(runs[0]!.threads_scanned).toBe(2);
    expect(runs[0]!.threads_saved).toBe(1);
  });

  test("deduplication: second run with same posts creates no duplicates", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    // First run
    mockRedditPostFetch([{ id: "dedup-p1" }]);
    mockThreadScoring([
      {
        postId: "dedup-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      },
    ]);
    mockRedditCommentFetch("dedup-p1", []);
    mockCommentScoring([]);

    await runPipeline();

    // Second run with same post
    mockRedditPostFetch([{ id: "dedup-p1" }]);
    mockThreadScoring([
      {
        postId: "dedup-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      },
    ]);

    const result2 = await runPipeline();

    expect(result2.threadsSaved).toBe(0);
    const threads = await testSql`SELECT * FROM saved_threads WHERE post_id = 'dedup-p1'`;
    expect(threads).toHaveLength(1);
  });

  test("dryRun returns counts but writes nothing", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "dry-p1" }]);
    mockThreadScoring([
      {
        postId: "dry-p1",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      },
    ]);

    const comment = makeRedditCommentNode({
      id: "dry-c1",
      body: "Test",
      parent_id: "t3_dry-p1",
      depth: 0,
    });
    mockRedditCommentFetch("dry-p1", [comment]);
    mockCommentScoring([
      {
        commentId: "dry-c1",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "R",
        replyAngle: "A",
        urgency: "high",
      },
    ]);

    const result = await runPipeline({ dryRun: true });

    expect(result.threadsSaved).toBe(1);
    expect(result.commentsSaved).toBe(1);

    // Nothing written to DB
    const threads = await testSql`SELECT * FROM saved_threads`;
    expect(threads).toHaveLength(0);
    const items = await testSql`SELECT * FROM queue_items`;
    expect(items).toHaveLength(0);
    const runs = await testSql`SELECT * FROM crawl_runs`;
    expect(runs).toHaveLength(0);
  });

  test("no relevant threads → no writes", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "skip-p1" }]);
    mockThreadScoring([
      {
        postId: "skip-p1",
        verdict: "skip",
        relevanceScore: 0.2,
        reasoning: "Not relevant",
        suggestedTopics: [],
      },
    ]);

    const result = await runPipeline();

    expect(result.threadsSaved).toBe(0);
    expect(result.commentsSaved).toBe(0);

    const threads = await testSql`SELECT * FROM saved_threads`;
    expect(threads).toHaveLength(0);
  });

  test("custom subreddits only fetches from those", async () => {
    const { runPipeline } = await import("@/src/lib/pipeline/runner");

    mockRedditPostFetch([{ id: "custom-p1", subreddit: "typescript" }]);
    mockThreadScoring([]);

    await runPipeline({ subreddits: ["typescript"] });

    // Verify the fetch was called for the right subreddit
    const fetchCall = mockRedditFetch.mock.calls[0]![0] as unknown as string;
    expect(fetchCall).toContain("/r/typescript/");
  });
});
