import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { RedditPost, CommentTree, RedditComment } from "@/src/types/reddit";
import type { ThreadScore } from "@/src/types/scoring";
import type { CommentScore } from "@/src/types/scoring";
import type { CrawlRun, SavedThread } from "@/src/types/storage";

// --- Mocks ---

const mockFetchNewPosts = mock<(subreddits: string[], limit?: number) => Promise<RedditPost[]>>(
  () => Promise.resolve([])
);
const mockFetchCommentTree = mock<(postId: string, subreddit: string) => Promise<CommentTree>>(
  () => Promise.resolve({ post: makePost("1"), comments: [] })
);
const mockScoreThreadBatch = mock<(posts: RedditPost[], config: any) => Promise<ThreadScore[]>>(
  () => Promise.resolve([])
);
const mockScoreComments = mock<(tree: CommentTree, config: any) => Promise<CommentScore[]>>(
  () => Promise.resolve([])
);
const mockCreateCrawlRun = mock<(subreddits: string[]) => Promise<CrawlRun>>(
  () => Promise.resolve(makeCrawlRun())
);
const mockCompleteCrawlRun = mock<(id: string, stats: any) => Promise<CrawlRun>>(
  () => Promise.resolve(makeCrawlRun())
);
const mockThreadExists = mock<(postId: string) => Promise<boolean>>(
  () => Promise.resolve(false)
);
const mockSaveThread = mock<(thread: any) => Promise<SavedThread>>(
  (t) => Promise.resolve({ id: "thread-1", savedAt: new Date(), ...t })
);
const mockSaveQueueItem = mock<(item: any) => Promise<any>>(
  (i) => Promise.resolve({ id: "qi-1", savedAt: new Date(), ...i })
);
const mockSaveThreadWithComments = mock<(thread: any, items: any[]) => Promise<any>>(
  (t, items) => Promise.resolve({
    thread: { id: "thread-1", savedAt: new Date(), ...t },
    comments: items.map((i, idx) => ({ id: `qi-${idx}`, savedAt: new Date(), ...i })),
  })
);
const mockCommentExists = mock(() => Promise.resolve(false));
const mockGetQueue = mock(() => Promise.resolve([]));
const mockUpdateQueueItem = mock(() => Promise.resolve({}));

mock.module("@/src/lib/reddit/crawler", () => ({
  fetchNewPosts: mockFetchNewPosts,
}));
mock.module("@/src/lib/reddit/fetcher", () => ({
  fetchCommentTree: mockFetchCommentTree,
}));
mock.module("@/src/lib/scoring/thread", () => ({
  scoreThreadBatch: mockScoreThreadBatch,
}));
mock.module("@/src/lib/scoring/comment", () => ({
  scoreComments: mockScoreComments,
}));
mock.module("@/src/lib/db/repository", () => ({
  createCrawlRun: mockCreateCrawlRun,
  completeCrawlRun: mockCompleteCrawlRun,
  threadExists: mockThreadExists,
  saveThread: mockSaveThread,
  saveQueueItem: mockSaveQueueItem,
  saveThreadWithComments: mockSaveThreadWithComments,
  commentExists: mockCommentExists,
  getQueue: mockGetQueue,
  updateQueueItem: mockUpdateQueueItem,
}));
mock.module("@/src/lib/config", () => ({
  config: {
    reddit: { clientId: "x", clientSecret: "x", userAgent: "test", rateLimitMs: 0 },
    anthropic: { apiKey: "x", model: "test" },
    scoring: {
      topicDescription: "test",
      replyPersona: "test",
      threadThreshold: 0.5,
      commentThreshold: 0.6,
    },
    db: { url: "postgres://test" },
    pipeline: {
      subreddits: ["programming"],
      batchSize: 20,
      maxCommentsPerThread: 100,
      pollIntervalMs: 60000,
    },
  },
}));

// Must import after mocks are set up
const { runPipeline } = await import("@/src/lib/pipeline/runner");

// --- Helpers ---

function makePost(id: string, subreddit = "programming"): RedditPost {
  return {
    id,
    title: `Post ${id}`,
    url: `https://reddit.com/r/${subreddit}/comments/${id}/`,
    subreddit,
    upvotes: 10,
    numComments: 5,
    selftext: "Some text",
    author: "user1",
    createdUtc: Date.now() / 1000,
  };
}

function makeComment(id: string, postId: string, depth = 0): RedditComment {
  return {
    id,
    postId,
    parentId: postId,
    body: `Comment ${id}`,
    author: "commenter",
    upvotes: 5,
    depth,
    createdUtc: Date.now() / 1000,
    parentChain: [],
  };
}

function makeCrawlRun(): CrawlRun {
  return {
    id: "crawl-1",
    startedAt: new Date(),
    completedAt: null,
    subreddits: ["programming"],
    threadsScanned: 0,
    threadsSaved: 0,
    commentsSaved: 0,
    errorMessage: null,
  };
}

// --- Tests ---

beforeEach(() => {
  mockFetchNewPosts.mockReset();
  mockFetchCommentTree.mockReset();
  mockScoreThreadBatch.mockReset();
  mockScoreComments.mockReset();
  mockCreateCrawlRun.mockReset();
  mockCompleteCrawlRun.mockReset();
  mockThreadExists.mockReset();
  mockSaveThread.mockReset();
  mockSaveQueueItem.mockReset();
  mockSaveThreadWithComments.mockReset();

  // Defaults
  mockFetchNewPosts.mockResolvedValue([]);
  mockScoreThreadBatch.mockResolvedValue([]);
  mockScoreComments.mockResolvedValue([]);
  mockCreateCrawlRun.mockResolvedValue(makeCrawlRun());
  mockCompleteCrawlRun.mockResolvedValue(makeCrawlRun());
  mockThreadExists.mockResolvedValue(false);
  mockSaveThread.mockImplementation((t) =>
    Promise.resolve({ id: "thread-1", savedAt: new Date(), ...t })
  );
  mockSaveQueueItem.mockImplementation((i) =>
    Promise.resolve({ id: "qi-1", savedAt: new Date(), ...i })
  );
  mockSaveThreadWithComments.mockImplementation((t, items) =>
    Promise.resolve({
      thread: { id: "thread-1", savedAt: new Date(), ...t },
      comments: items.map((i: any, idx: number) => ({ id: `qi-${idx}`, savedAt: new Date(), ...i })),
    })
  );
});

describe("runPipeline", () => {
  test("returns zero counts when no posts found", async () => {
    const result = await runPipeline();

    expect(result.threadsScanned).toBe(0);
    expect(result.threadsSaved).toBe(0);
    expect(result.commentsSaved).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockCreateCrawlRun).toHaveBeenCalledTimes(1);
    expect(mockCompleteCrawlRun).toHaveBeenCalledTimes(1);
  });

  test("creates and completes crawl run", async () => {
    await runPipeline();

    expect(mockCreateCrawlRun).toHaveBeenCalledWith(["programming"]);
    expect(mockCompleteCrawlRun).toHaveBeenCalledWith("crawl-1", {
      threadsScanned: 0,
      threadsSaved: 0,
      commentsSaved: 0,
    });
  });

  test("uses custom subreddits from options", async () => {
    await runPipeline({ subreddits: ["typescript", "webdev"] });

    expect(mockCreateCrawlRun).toHaveBeenCalledWith(["typescript", "webdev"]);
    expect(mockFetchNewPosts).toHaveBeenCalledWith(
      ["typescript", "webdev"],
      undefined
    );
  });

  test("passes maxPosts to fetchNewPosts", async () => {
    await runPipeline({ maxPosts: 5 });

    expect(mockFetchNewPosts).toHaveBeenCalledWith(["programming"], 5);
  });

  test("scores and saves relevant threads with comments", async () => {
    const post = makePost("abc");
    const comment = makeComment("c1", "abc");

    mockFetchNewPosts.mockResolvedValue([post]);
    mockScoreThreadBatch.mockResolvedValue([
      {
        postId: "abc",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "Relevant",
        suggestedTopics: ["ai"],
      },
    ]);
    mockFetchCommentTree.mockResolvedValue({ post, comments: [comment] });
    mockScoreComments.mockResolvedValue([
      {
        commentId: "c1",
        postId: "abc",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Good comment",
        replyAngle: "Mention Skipper",
        urgency: "high",
      },
    ]);

    const result = await runPipeline();

    expect(result.threadsScanned).toBe(1);
    expect(result.threadsSaved).toBe(1);
    expect(result.commentsSaved).toBe(1);
    expect(mockSaveThreadWithComments).toHaveBeenCalledTimes(1);
  });

  test("skips threads below threshold", async () => {
    const post = makePost("low");
    mockFetchNewPosts.mockResolvedValue([post]);
    mockScoreThreadBatch.mockResolvedValue([
      {
        postId: "low",
        verdict: "dive_in",
        relevanceScore: 0.3, // below 0.5 threshold
        reasoning: "Low score",
        suggestedTopics: [],
      },
    ]);

    const result = await runPipeline();

    expect(result.threadsSaved).toBe(0);
    expect(mockFetchCommentTree).not.toHaveBeenCalled();
  });

  test("skips threads with verdict 'skip'", async () => {
    const post = makePost("skip");
    mockFetchNewPosts.mockResolvedValue([post]);
    mockScoreThreadBatch.mockResolvedValue([
      {
        postId: "skip",
        verdict: "skip",
        relevanceScore: 0.9,
        reasoning: "Not relevant",
        suggestedTopics: [],
      },
    ]);

    const result = await runPipeline();

    expect(result.threadsSaved).toBe(0);
    expect(mockFetchCommentTree).not.toHaveBeenCalled();
  });

  test("skips threads that already exist in DB", async () => {
    const post = makePost("existing");
    mockFetchNewPosts.mockResolvedValue([post]);
    mockScoreThreadBatch.mockResolvedValue([
      {
        postId: "existing",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "Relevant",
        suggestedTopics: [],
      },
    ]);
    mockThreadExists.mockResolvedValue(true);

    const result = await runPipeline();

    expect(result.threadsSaved).toBe(0);
    expect(mockFetchCommentTree).not.toHaveBeenCalled();
    expect(mockSaveThreadWithComments).not.toHaveBeenCalled();
  });

  test("dryRun skips all DB writes", async () => {
    const post = makePost("dry");
    const comment = makeComment("c1", "dry");

    mockFetchNewPosts.mockResolvedValue([post]);
    mockScoreThreadBatch.mockResolvedValue([
      {
        postId: "dry",
        verdict: "dive_in",
        relevanceScore: 0.8,
        reasoning: "Relevant",
        suggestedTopics: ["test"],
      },
    ]);
    mockFetchCommentTree.mockResolvedValue({ post, comments: [comment] });
    mockScoreComments.mockResolvedValue([
      {
        commentId: "c1",
        postId: "dry",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Good",
        replyAngle: "Angle",
        urgency: "medium",
      },
    ]);

    const result = await runPipeline({ dryRun: true });

    expect(result.threadsSaved).toBe(1);
    expect(result.commentsSaved).toBe(1);
    expect(mockCreateCrawlRun).not.toHaveBeenCalled();
    expect(mockCompleteCrawlRun).not.toHaveBeenCalled();
    expect(mockThreadExists).toHaveBeenCalled();
    expect(mockSaveThreadWithComments).not.toHaveBeenCalled();
  });

  test("batches thread scoring in groups of 20", async () => {
    const posts = Array.from({ length: 25 }, (_, i) => makePost(`p${i}`));
    mockFetchNewPosts.mockResolvedValue(posts);
    mockScoreThreadBatch.mockResolvedValue([]);

    await runPipeline();

    expect(mockScoreThreadBatch).toHaveBeenCalledTimes(2);
    // First batch: 20 posts
    expect(mockScoreThreadBatch.mock.calls[0]![0]).toHaveLength(20);
    // Second batch: 5 posts
    expect(mockScoreThreadBatch.mock.calls[1]![0]).toHaveLength(5);
  });

  test("completes crawl run with error on failure", async () => {
    mockFetchNewPosts.mockRejectedValue(new Error("Reddit is down"));

    await expect(runPipeline()).rejects.toThrow("Reddit is down");

    expect(mockCompleteCrawlRun).toHaveBeenCalledWith("crawl-1", {
      threadsScanned: 0,
      threadsSaved: 0,
      commentsSaved: 0,
      errorMessage: "Reddit is down",
    });
  });

  test("processes multiple passing threads", async () => {
    const posts = [makePost("a"), makePost("b")];
    mockFetchNewPosts.mockResolvedValue(posts);
    mockScoreThreadBatch.mockResolvedValue([
      { postId: "a", verdict: "dive_in", relevanceScore: 0.7, reasoning: "R", suggestedTopics: [] },
      { postId: "b", verdict: "dive_in", relevanceScore: 0.9, reasoning: "R", suggestedTopics: [] },
    ]);
    mockFetchCommentTree
      .mockResolvedValueOnce({ post: posts[0]!, comments: [makeComment("ca", "a")] })
      .mockResolvedValueOnce({ post: posts[1]!, comments: [makeComment("cb", "b")] });
    mockScoreComments
      .mockResolvedValueOnce([
        { commentId: "ca", postId: "a", verdict: "reply_worthy", relevanceScore: 0.8, reasoning: "G", replyAngle: "A", urgency: "low" as const },
      ])
      .mockResolvedValueOnce([
        { commentId: "cb", postId: "b", verdict: "interesting", relevanceScore: 0.7, reasoning: "G", replyAngle: null, urgency: "medium" as const },
      ]);

    const result = await runPipeline();

    expect(result.threadsScanned).toBe(2);
    expect(result.threadsSaved).toBe(2);
    expect(result.commentsSaved).toBe(2);
    expect(mockSaveThreadWithComments).toHaveBeenCalledTimes(2);
  });
});
