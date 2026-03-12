import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { RedditComment } from "@/src/types/reddit";
import type { SavedThread, QueueItem, QueueItemWithThread, CrawlRun, QueueItemStatus } from "@/src/types/storage";

/**
 * Repository unit tests verify the row mapper logic (snake_case → camelCase,
 * Date parsing, parseParentChain, null handling).
 *
 * Because bun's mock.module is process-wide and other test files mock
 * @/src/lib/db/repository, we can't import the real module. Instead,
 * we reimplement the mapper functions inline and test them directly.
 * We also register a complete mock.module so other files see all exports.
 */

// --- Row mapper reimplementation (matching src/lib/db/repository.ts) ---

function parseParentChain(value: unknown): RedditComment[] {
  if (Array.isArray(value)) return value as RedditComment[];
  if (typeof value === "string") return JSON.parse(value) as RedditComment[];
  return [];
}

function mapThread(row: Record<string, unknown>): SavedThread {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    title: row.title as string,
    url: row.url as string,
    subreddit: row.subreddit as string,
    relevanceScore: row.relevance_score as number,
    reasoning: row.reasoning as string,
    suggestedTopics: row.suggested_topics as string[],
    savedAt: new Date(row.saved_at as string),
  };
}

function mapQueueItem(row: Record<string, unknown>): QueueItem {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    commentId: row.comment_id as string,
    commentBody: row.comment_body as string,
    commentUrl: row.comment_url as string,
    author: row.author as string,
    upvotes: row.upvotes as number,
    depth: row.depth as number,
    relevanceScore: row.relevance_score as number,
    reasoning: row.reasoning as string,
    replyAngle: (row.reply_angle as string) ?? null,
    urgency: row.urgency as QueueItem["urgency"],
    status: row.status as QueueItem["status"],
    parentChain: parseParentChain(row.parent_chain),
    savedAt: new Date(row.saved_at as string),
    repliedAt: row.replied_at ? new Date(row.replied_at as string) : null,
    notes: (row.notes as string) ?? null,
  };
}

function mapQueueItemWithThread(row: Record<string, unknown>): QueueItemWithThread {
  return {
    ...mapQueueItem(row),
    thread: {
      id: row.t_id as string,
      postId: row.post_id as string,
      title: row.title as string,
      url: row.url as string,
      subreddit: row.subreddit as string,
      relevanceScore: row.t_relevance_score as number,
      reasoning: row.t_reasoning as string,
      suggestedTopics: row.suggested_topics as string[],
      savedAt: new Date(row.t_saved_at as string),
    },
  };
}

function mapCrawlRun(row: Record<string, unknown>): CrawlRun {
  return {
    id: row.id as string,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    subreddits: row.subreddits as string[],
    threadsScanned: row.threads_scanned as number,
    threadsSaved: row.threads_saved as number,
    commentsSaved: row.comments_saved as number,
    errorMessage: (row.error_message as string) ?? null,
  };
}

// --- Register complete mock so other test files see all exports ---

mock.module("@/src/lib/db/repository", () => ({
  saveThread: mock(async (t: Omit<SavedThread, "id" | "savedAt">) =>
    mapThread({ id: "mock-id", saved_at: new Date().toISOString(), post_id: t.postId, title: t.title, url: t.url, subreddit: t.subreddit, relevance_score: t.relevanceScore, reasoning: t.reasoning, suggested_topics: t.suggestedTopics })
  ),
  threadExists: mock(() => Promise.resolve(false)),
  saveQueueItem: mock(() => Promise.resolve({})),
  saveThreadWithComments: mock(() => Promise.resolve({ thread: {}, comments: [] })),
  commentExists: mock(() => Promise.resolve(false)),
  getQueue: mock(() => Promise.resolve([])),
  updateQueueItem: mock(() => Promise.resolve({})),
  createCrawlRun: mock(() => Promise.resolve({})),
  completeCrawlRun: mock(() => Promise.resolve({})),
}));

// --- Tests ---

describe("mapThread", () => {
  test("maps snake_case DB row to camelCase SavedThread", () => {
    const result = mapThread({
      id: "uuid-1",
      post_id: "post-1",
      title: "Test Thread",
      url: "https://reddit.com/test",
      subreddit: "prog",
      relevance_score: 0.85,
      reasoning: "Relevant",
      suggested_topics: ["ai"],
      saved_at: "2025-01-15T10:00:00Z",
    });

    expect(result.id).toBe("uuid-1");
    expect(result.postId).toBe("post-1");
    expect(result.title).toBe("Test Thread");
    expect(result.subreddit).toBe("prog");
    expect(result.relevanceScore).toBe(0.85);
    expect(result.suggestedTopics).toEqual(["ai"]);
    expect(result.savedAt).toBeInstanceOf(Date);
  });
});

describe("mapQueueItem", () => {
  test("maps QueueItem row with null optional fields", () => {
    const result = mapQueueItem({
      id: "qi-1",
      thread_id: "t-1",
      comment_id: "c-1",
      comment_body: "Test body",
      comment_url: "https://reddit.com/test",
      author: "user1",
      upvotes: 10,
      depth: 0,
      relevance_score: 0.9,
      reasoning: "Good",
      reply_angle: null,
      urgency: "high",
      status: "pending",
      parent_chain: "[]",
      saved_at: "2025-01-15T10:00:00Z",
      replied_at: null,
      notes: null,
    });

    expect(result.id).toBe("qi-1");
    expect(result.replyAngle).toBeNull();
    expect(result.repliedAt).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.parentChain).toEqual([]);
  });

  test("parses Date for repliedAt when present", () => {
    const result = mapQueueItem({
      id: "qi-1",
      thread_id: "t-1",
      comment_id: "c-1",
      comment_body: "Test",
      comment_url: "https://test",
      author: "user",
      upvotes: 5,
      depth: 1,
      relevance_score: 0.7,
      reasoning: "OK",
      reply_angle: "Some angle",
      urgency: "medium",
      status: "replied",
      parent_chain: [],
      saved_at: "2025-01-15T10:00:00Z",
      replied_at: "2025-01-16T12:00:00Z",
      notes: "Replied via DM",
    });

    expect(result.repliedAt).toBeInstanceOf(Date);
    expect(result.replyAngle).toBe("Some angle");
    expect(result.notes).toBe("Replied via DM");
  });
});

describe("parseParentChain", () => {
  test("array passthrough", () => {
    const chain: RedditComment[] = [
      {
        id: "c0", postId: "p1", parentId: "p1", body: "parent",
        author: "a", upvotes: 1, depth: 0, createdUtc: 0, parentChain: [],
      },
    ];
    expect(parseParentChain(chain)).toEqual(chain);
  });

  test("JSON string parse", () => {
    const chain = [
      {
        id: "c0", postId: "p1", parentId: "p1", body: "test",
        author: "a", upvotes: 1, depth: 0, createdUtc: 0, parentChain: [],
      },
    ];
    expect(parseParentChain(JSON.stringify(chain))).toEqual(chain);
  });

  test("null → empty array", () => {
    expect(parseParentChain(null)).toEqual([]);
  });

  test("undefined → empty array", () => {
    expect(parseParentChain(undefined)).toEqual([]);
  });
});

describe("mapQueueItemWithThread", () => {
  test("nests thread with t_ prefixed fields", () => {
    const result = mapQueueItemWithThread({
      id: "qi-1",
      thread_id: "t-1",
      comment_id: "c-1",
      comment_body: "Test",
      comment_url: "https://test",
      author: "user",
      upvotes: 5,
      depth: 0,
      relevance_score: 0.7,
      reasoning: "Comment reasoning",
      reply_angle: "Angle",
      urgency: "medium",
      status: "pending",
      parent_chain: [],
      saved_at: "2025-01-15T10:00:00Z",
      replied_at: null,
      notes: null,
      t_id: "thread-uuid",
      post_id: "reddit-post-1",
      title: "Thread Title",
      url: "https://reddit.com/thread",
      subreddit: "programming",
      t_relevance_score: 0.85,
      t_reasoning: "Thread reasoning",
      suggested_topics: ["ai"],
      t_saved_at: "2025-01-14T09:00:00Z",
    });

    expect(result.id).toBe("qi-1");
    expect(result.relevanceScore).toBe(0.7);
    expect(result.reasoning).toBe("Comment reasoning");

    expect(result.thread.id).toBe("thread-uuid");
    expect(result.thread.postId).toBe("reddit-post-1");
    expect(result.thread.title).toBe("Thread Title");
    expect(result.thread.relevanceScore).toBe(0.85);
    expect(result.thread.reasoning).toBe("Thread reasoning");
    expect(result.thread.savedAt).toBeInstanceOf(Date);
  });
});

describe("mapCrawlRun", () => {
  test("maps crawl run with null completedAt and errorMessage", () => {
    const result = mapCrawlRun({
      id: "cr-1",
      started_at: "2025-01-15T10:00:00Z",
      completed_at: null,
      subreddits: ["programming", "webdev"],
      threads_scanned: 0,
      threads_saved: 0,
      comments_saved: 0,
      error_message: null,
    });

    expect(result.id).toBe("cr-1");
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeNull();
    expect(result.subreddits).toEqual(["programming", "webdev"]);
    expect(result.errorMessage).toBeNull();
  });

  test("maps completed crawl run with stats", () => {
    const result = mapCrawlRun({
      id: "cr-1",
      started_at: "2025-01-15T10:00:00Z",
      completed_at: "2025-01-15T10:05:00Z",
      subreddits: ["programming"],
      threads_scanned: 50,
      threads_saved: 3,
      comments_saved: 12,
      error_message: null,
    });

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.threadsScanned).toBe(50);
    expect(result.threadsSaved).toBe(3);
    expect(result.commentsSaved).toBe(12);
  });

  test("maps crawl run with error message", () => {
    const result = mapCrawlRun({
      id: "cr-1",
      started_at: "2025-01-15T10:00:00Z",
      completed_at: "2025-01-15T10:01:00Z",
      subreddits: ["programming"],
      threads_scanned: 0,
      threads_saved: 0,
      comments_saved: 0,
      error_message: "Reddit API failed",
    });

    expect(result.errorMessage).toBe("Reddit API failed");
  });
});
