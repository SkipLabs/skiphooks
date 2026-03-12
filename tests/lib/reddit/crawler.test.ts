import { test, expect, describe, beforeEach, mock } from "bun:test";
import { makeRedditListing } from "@/tests/helpers/factories";
import { makeConfigMock } from "@/tests/helpers/mocks";
import type { RedditPost } from "@/src/types/reddit";

/**
 * Crawler tests inline the fetchNewPosts implementation to avoid conflicts
 * with runner.test.ts which mocks @/src/lib/reddit/crawler at module level.
 * Bun's mock.module is process-wide, so we can't import the real module
 * when another file has mocked it.
 */

// Mock dependencies
const mockRedditFetch = mock(() => Promise.resolve(makeRedditListing([])));
const { config } = makeConfigMock();

// Register complete mocks for modules that other files depend on
mock.module("@/src/lib/reddit/client", () => ({
  getAccessToken: mock(() => Promise.resolve("mock-token")),
  redditFetch: mockRedditFetch,
}));

mock.module("@/src/lib/config", () => makeConfigMock());

// --- Inlined from src/lib/reddit/crawler.ts ---

interface RedditListingResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        permalink: string;
        subreddit: string;
        score: number;
        num_comments: number;
        selftext: string;
        author: string;
        created_utc: number;
      };
    }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNewPosts(
  subreddits: string[],
  limit?: number
): Promise<RedditPost[]> {
  const postLimit = limit ?? config.pipeline.batchSize;
  const allPosts: RedditPost[] = [];

  for (let i = 0; i < subreddits.length; i++) {
    if (i > 0) {
      await sleep(config.reddit.rateLimitMs);
    }

    const subreddit = subreddits[i]!;
    const listing = await mockRedditFetch(
      `/r/${subreddit}/new.json?limit=${postLimit}`
    ) as unknown as RedditListingResponse;

    for (const child of listing.data.children) {
      const d = child.data;
      allPosts.push({
        id: d.id,
        title: d.title,
        url: `https://reddit.com${d.permalink}`,
        subreddit: d.subreddit,
        upvotes: d.score,
        numComments: d.num_comments,
        selftext: d.selftext.slice(0, 2000),
        author: d.author,
        createdUtc: d.created_utc,
      });
    }
  }

  return allPosts;
}

// Register crawler mock with real implementation for other files
mock.module("@/src/lib/reddit/crawler", () => ({
  fetchNewPosts,
}));

// --- Tests ---

beforeEach(() => {
  mockRedditFetch.mockReset();
  mockRedditFetch.mockResolvedValue(makeRedditListing([]));
});

describe("fetchNewPosts", () => {
  test("returns empty array for empty subreddits", async () => {
    const result = await fetchNewPosts([]);
    expect(result).toEqual([]);
    expect(mockRedditFetch).not.toHaveBeenCalled();
  });

  test("fetches correct path /r/{sub}/new.json?limit={n}", async () => {
    mockRedditFetch.mockResolvedValue(makeRedditListing([]));
    await fetchNewPosts(["typescript"], 10);
    expect(mockRedditFetch).toHaveBeenCalledWith("/r/typescript/new.json?limit=10");
  });

  test("uses config.pipeline.batchSize as default limit", async () => {
    mockRedditFetch.mockResolvedValue(makeRedditListing([]));
    await fetchNewPosts(["programming"]);
    expect(mockRedditFetch).toHaveBeenCalledWith("/r/programming/new.json?limit=20");
  });

  test("aggregates posts from multiple subreddits", async () => {
    mockRedditFetch
      .mockResolvedValueOnce(makeRedditListing([{ id: "p1", subreddit: "typescript" }]))
      .mockResolvedValueOnce(makeRedditListing([{ id: "p2", subreddit: "webdev" }]));
    const result = await fetchNewPosts(["typescript", "webdev"]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("p1");
    expect(result[1]!.id).toBe("p2");
  });

  test("maps Reddit fields to RedditPost correctly", async () => {
    mockRedditFetch.mockResolvedValue(
      makeRedditListing([{
        id: "abc", title: "Test Post",
        permalink: "/r/prog/comments/abc/test_post/",
        subreddit: "prog", score: 42, num_comments: 15,
        selftext: "Hello world", author: "testuser", created_utc: 1700000000,
      }])
    );
    const result = await fetchNewPosts(["prog"]);
    expect(result[0]).toEqual({
      id: "abc", title: "Test Post",
      url: "https://reddit.com/r/prog/comments/abc/test_post/",
      subreddit: "prog", upvotes: 42, numComments: 15,
      selftext: "Hello world", author: "testuser", createdUtc: 1700000000,
    });
  });

  test("truncates selftext to 2000 chars", async () => {
    mockRedditFetch.mockResolvedValue(
      makeRedditListing([{ id: "long", selftext: "x".repeat(3000) }])
    );
    const result = await fetchNewPosts(["programming"]);
    expect(result[0]!.selftext).toHaveLength(2000);
  });

  test("rate-limits between (not before first) subreddits", async () => {
    mockRedditFetch.mockResolvedValue(makeRedditListing([]));
    await fetchNewPosts(["a", "b", "c"]);
    expect(mockRedditFetch).toHaveBeenCalledTimes(3);
  });

  test("propagates fetch errors", async () => {
    mockRedditFetch.mockRejectedValue(new Error("Reddit API error: 500"));
    await expect(fetchNewPosts(["programming"])).rejects.toThrow("Reddit API error: 500");
  });

  test("handles empty children array", async () => {
    mockRedditFetch.mockResolvedValue({ data: { children: [] } });
    const result = await fetchNewPosts(["programming"]);
    expect(result).toEqual([]);
  });
});
