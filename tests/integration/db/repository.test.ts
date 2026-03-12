import { test, expect, describe, beforeAll, beforeEach, afterAll } from "bun:test";
import { setupTestDb, truncateTables, teardownTestDb } from "@/tests/helpers/db";
import type postgres from "postgres";

// Mock the DB client to use our test connection
let testSql: postgres.Sql;

const hasTestDb = !!process.env.TEST_DATABASE_URL;

// Skip all tests if no TEST_DATABASE_URL
describe.skipIf(!hasTestDb)("DB Repository Integration", () => {
  beforeAll(async () => {
    testSql = await setupTestDb();

    // Mock getDb to return our test connection
    const { mock } = await import("bun:test");
    mock.module("@/src/lib/db/client", () => ({
      getDb: () => testSql,
    }));
  });

  beforeEach(async () => {
    await truncateTables(testSql);
  });

  afterAll(async () => {
    if (testSql) await teardownTestDb(testSql);
  });

  // Lazy import to pick up mocked getDb
  async function getRepo() {
    return await import("@/src/lib/db/repository");
  }

  // --- Threads ---

  describe("saveThread", () => {
    test("returns thread with id and savedAt", async () => {
      const repo = await getRepo();
      const result = await repo.saveThread({
        postId: "reddit-post-1",
        title: "Test Thread",
        url: "https://reddit.com/r/prog/comments/1/",
        subreddit: "programming",
        relevanceScore: 0.85,
        reasoning: "Relevant to our product",
        suggestedTopics: ["ai", "dev-tools"],
      });

      expect(result.id).toBeTruthy();
      expect(result.savedAt).toBeInstanceOf(Date);
      expect(result.postId).toBe("reddit-post-1");
      expect(result.suggestedTopics).toEqual(["ai", "dev-tools"]);
    });

    test("duplicate post_id throws", async () => {
      const repo = await getRepo();
      await repo.saveThread({
        postId: "dup-post",
        title: "First",
        url: "https://reddit.com/1",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      await expect(
        repo.saveThread({
          postId: "dup-post",
          title: "Second",
          url: "https://reddit.com/2",
          subreddit: "prog",
          relevanceScore: 0.9,
          reasoning: "R2",
          suggestedTopics: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("threadExists", () => {
    test("returns true for existing post_id", async () => {
      const repo = await getRepo();
      await repo.saveThread({
        postId: "existing-post",
        title: "Test",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      const exists = await repo.threadExists("existing-post");
      expect(exists).toBe(true);
    });

    test("returns false for non-existing post_id", async () => {
      const repo = await getRepo();
      const exists = await repo.threadExists("nonexistent");
      expect(exists).toBe(false);
    });
  });

  // --- Queue items ---

  describe("saveQueueItem", () => {
    test("saves queue item with generated id", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "p1",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "comment-1",
        commentBody: "Test comment",
        commentUrl: "https://reddit.com/comment",
        author: "user1",
        upvotes: 10,
        depth: 0,
        relevanceScore: 0.9,
        reasoning: "Very relevant",
        replyAngle: "Mention our product",
        urgency: "high",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });

      expect(item.id).toBeTruthy();
      expect(item.commentId).toBe("comment-1");
      expect(item.status).toBe("pending");
    });

    test("duplicate comment_id throws", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "p2",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      const itemData = {
        threadId: thread.id,
        commentId: "dup-comment",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "medium" as const,
        status: "pending" as const,
        parentChain: [],
        repliedAt: null,
        notes: null,
      };

      await repo.saveQueueItem(itemData);
      await expect(repo.saveQueueItem(itemData)).rejects.toThrow();
    });

    test("stores parentChain as JSONB", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "p3",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      const parentChain = [
        {
          id: "c0",
          postId: "p3",
          parentId: "p3",
          body: "parent comment",
          author: "alice",
          upvotes: 3,
          depth: 0,
          createdUtc: 1700000000,
          parentChain: [],
        },
      ];

      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "c1",
        commentBody: "Reply",
        commentUrl: "https://test",
        author: "bob",
        upvotes: 2,
        depth: 1,
        relevanceScore: 0.8,
        reasoning: "R",
        replyAngle: null,
        urgency: "low",
        status: "pending",
        parentChain,
        repliedAt: null,
        notes: null,
      });

      expect(item.parentChain).toHaveLength(1);
      expect(item.parentChain[0]!.id).toBe("c0");
      expect(item.parentChain[0]!.body).toBe("parent comment");
    });

    test("invalid thread_id FK throws", async () => {
      const repo = await getRepo();
      await expect(
        repo.saveQueueItem({
          threadId: "nonexistent-thread-id",
          commentId: "c1",
          commentBody: "Test",
          commentUrl: "https://test",
          author: "user",
          upvotes: 5,
          depth: 0,
          relevanceScore: 0.7,
          reasoning: "R",
          replyAngle: null,
          urgency: "medium",
          status: "pending",
          parentChain: [],
          repliedAt: null,
          notes: null,
        })
      ).rejects.toThrow();
    });
  });

  describe("commentExists", () => {
    test("returns true for existing comment_id", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "p-exists",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });

      await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "existing-comment",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "low",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });

      const exists = await repo.commentExists("existing-comment");
      expect(exists).toBe(true);
    });

    test("returns false for non-existing comment_id", async () => {
      const repo = await getRepo();
      const exists = await repo.commentExists("ghost-comment");
      expect(exists).toBe(false);
    });
  });

  // --- getQueue ---

  describe("getQueue", () => {
    async function seedData(repo: typeof import("@/src/lib/db/repository")) {
      const thread1 = await repo.saveThread({
        postId: "gq-p1",
        title: "Thread 1",
        url: "https://test/1",
        subreddit: "programming",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });
      const thread2 = await repo.saveThread({
        postId: "gq-p2",
        title: "Thread 2",
        url: "https://test/2",
        subreddit: "webdev",
        relevanceScore: 0.9,
        reasoning: "R",
        suggestedTopics: ["web"],
      });

      await repo.saveQueueItem({
        threadId: thread1.id,
        commentId: "gq-c1",
        commentBody: "Comment 1",
        commentUrl: "https://test/c1",
        author: "user1",
        upvotes: 10,
        depth: 0,
        relevanceScore: 0.9,
        reasoning: "High relevance",
        replyAngle: "Mention product",
        urgency: "high",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });
      await repo.saveQueueItem({
        threadId: thread2.id,
        commentId: "gq-c2",
        commentBody: "Comment 2",
        commentUrl: "https://test/c2",
        author: "user2",
        upvotes: 3,
        depth: 1,
        relevanceScore: 0.6,
        reasoning: "Medium relevance",
        replyAngle: null,
        urgency: "low",
        status: "dismissed",
        parentChain: [],
        repliedAt: null,
        notes: "Not worth it",
      });

      return { thread1, thread2 };
    }

    test("returns all items with joined thread data", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue();

      expect(items).toHaveLength(2);
      // Should have thread data
      expect(items[0]!.thread).toBeDefined();
      expect(items[0]!.thread.title).toBeTruthy();
    });

    test("filters by status", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({ status: "pending" });

      expect(items).toHaveLength(1);
      expect(items[0]!.status).toBe("pending");
    });

    test("filters by urgency", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({ urgency: "high" });

      expect(items).toHaveLength(1);
      expect(items[0]!.urgency).toBe("high");
    });

    test("filters by subreddit", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({ subreddit: "webdev" });

      expect(items).toHaveLength(1);
      expect(items[0]!.thread.subreddit).toBe("webdev");
    });

    test("filters by minScore", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({ minScore: 0.8 });

      expect(items).toHaveLength(1);
      expect(items[0]!.relevanceScore).toBeGreaterThanOrEqual(0.8);
    });

    test("combines multiple filters", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({
        status: "pending",
        urgency: "high",
      });

      expect(items).toHaveLength(1);
      expect(items[0]!.commentId).toBe("gq-c1");
    });

    test("ordered by saved_at DESC", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue();

      // Most recently saved item should be first
      expect(items).toHaveLength(2);
      expect(
        items[0]!.savedAt.getTime()
      ).toBeGreaterThanOrEqual(items[1]!.savedAt.getTime());
    });

    test("empty result for non-matching filter", async () => {
      const repo = await getRepo();
      await seedData(repo);

      const items = await repo.getQueue({ status: "snoozed" });
      expect(items).toEqual([]);
    });
  });

  // --- Updates ---

  describe("updateQueueItem", () => {
    test("changes status", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "upd-p1",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });
      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "upd-c1",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "medium",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });

      const updated = await repo.updateQueueItem(item.id, { status: "dismissed" });
      expect(updated.status).toBe("dismissed");
    });

    test("'replied' sets replied_at", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "rep-p1",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });
      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "rep-c1",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "medium",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });

      const updated = await repo.updateQueueItem(item.id, { status: "replied" });
      expect(updated.status).toBe("replied");
      expect(updated.repliedAt).toBeInstanceOf(Date);
    });

    test("'dismissed' doesn't set replied_at", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "dis-p1",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });
      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "dis-c1",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "medium",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: null,
      });

      const updated = await repo.updateQueueItem(item.id, { status: "dismissed" });
      expect(updated.repliedAt).toBeNull();
    });

    test("overwrites existing notes", async () => {
      const repo = await getRepo();
      const thread = await repo.saveThread({
        postId: "note-p1",
        title: "T",
        url: "https://test",
        subreddit: "prog",
        relevanceScore: 0.8,
        reasoning: "R",
        suggestedTopics: [],
      });
      const item = await repo.saveQueueItem({
        threadId: thread.id,
        commentId: "note-c1",
        commentBody: "Test",
        commentUrl: "https://test",
        author: "user",
        upvotes: 5,
        depth: 0,
        relevanceScore: 0.7,
        reasoning: "R",
        replyAngle: null,
        urgency: "medium",
        status: "pending",
        parentChain: [],
        repliedAt: null,
        notes: "Original notes",
      });

      const updated = await repo.updateQueueItem(item.id, { notes: "Updated notes" });
      expect(updated.notes).toBe("Updated notes");
    });
  });

  // --- Crawl runs ---

  describe("createCrawlRun", () => {
    test("creates run with defaults", async () => {
      const repo = await getRepo();
      const run = await repo.createCrawlRun(["programming", "webdev"]);

      expect(run.id).toBeTruthy();
      expect(run.startedAt).toBeInstanceOf(Date);
      expect(run.completedAt).toBeNull();
      expect(run.subreddits).toEqual(["programming", "webdev"]);
      expect(run.threadsScanned).toBe(0);
      expect(run.threadsSaved).toBe(0);
      expect(run.commentsSaved).toBe(0);
      expect(run.errorMessage).toBeNull();
    });
  });

  describe("completeCrawlRun", () => {
    test("sets stats and completed_at", async () => {
      const repo = await getRepo();
      const run = await repo.createCrawlRun(["programming"]);

      const completed = await repo.completeCrawlRun(run.id, {
        threadsScanned: 50,
        threadsSaved: 3,
        commentsSaved: 12,
      });

      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.threadsScanned).toBe(50);
      expect(completed.threadsSaved).toBe(3);
      expect(completed.commentsSaved).toBe(12);
      expect(completed.errorMessage).toBeNull();
    });

    test("sets errorMessage when provided", async () => {
      const repo = await getRepo();
      const run = await repo.createCrawlRun(["programming"]);

      const completed = await repo.completeCrawlRun(run.id, {
        threadsScanned: 10,
        threadsSaved: 0,
        commentsSaved: 0,
        errorMessage: "Reddit API timed out",
      });

      expect(completed.errorMessage).toBe("Reddit API timed out");
      expect(completed.completedAt).toBeInstanceOf(Date);
    });
  });
});
