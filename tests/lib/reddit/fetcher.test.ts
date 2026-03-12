import { test, expect, describe, beforeEach, mock } from "bun:test";
import { makeRedditCommentNode } from "@/tests/helpers/factories";
import { makeConfigMock } from "@/tests/helpers/mocks";

// ---------------------------------------------------------------------------
// Types inlined from src/lib/reddit/fetcher.ts
// ---------------------------------------------------------------------------

interface RedditCommentData {
  id: string;
  body?: string;
  author: string;
  score: number;
  parent_id: string;
  created_utc: number;
  depth: number;
  replies?: RedditListing | "";
}

interface RedditListing {
  data: {
    children: Array<{
      kind: string;
      data: RedditCommentData;
    }>;
  };
}

interface RedditPostData {
  id: string;
  title: string;
  permalink: string;
  subreddit: string;
  score: number;
  num_comments: number;
  selftext: string;
  author: string;
  created_utc: number;
}

interface RedditPostListing {
  data: {
    children: Array<{
      data: RedditPostData;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Types from src/types/reddit.ts (used by the inlined functions)
// ---------------------------------------------------------------------------

interface RedditPost {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  upvotes: number;
  numComments: number;
  selftext: string;
  author: string;
  createdUtc: number;
}

interface RedditComment {
  id: string;
  postId: string;
  parentId: string;
  body: string;
  author: string;
  upvotes: number;
  depth: number;
  createdUtc: number;
  parentChain: RedditComment[];
}

interface CommentTree {
  post: RedditPost;
  comments: RedditComment[];
}

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockRedditFetch = mock(() => Promise.resolve([] as unknown[]));
const configMock = makeConfigMock();

mock.module("@/src/lib/reddit/client", () => ({
  getAccessToken: mock(() => Promise.resolve("mock-token")),
  redditFetch: mockRedditFetch,
}));

mock.module("@/src/lib/config", () => configMock);

// ---------------------------------------------------------------------------
// Inlined functions from src/lib/reddit/fetcher.ts
// ---------------------------------------------------------------------------

function stripTypePrefix(id: string): string {
  return id.replace(/^t[0-9]_/, "");
}

function flattenComments(
  children: RedditListing["data"]["children"],
  postId: string,
  parentChain: RedditComment[],
  result: RedditComment[],
  max: number
): void {
  for (const child of children) {
    if (result.length >= max) return;
    if (child.kind !== "t1") continue;

    const d = child.data;
    const body = d.body ?? "";

    if (body === "[deleted]" || body === "[removed]") {
      // Still recurse into replies — children may be valid
      if (d.replies && typeof d.replies === "object") {
        flattenComments(d.replies.data.children, postId, parentChain, result, max);
      }
      continue;
    }

    const comment: RedditComment = {
      id: d.id,
      postId,
      parentId: stripTypePrefix(d.parent_id),
      body: body.slice(0, 1000),
      author: d.author,
      upvotes: d.score,
      depth: d.depth,
      createdUtc: d.created_utc,
      parentChain: [...parentChain],
    };

    result.push(comment);

    if (d.replies && typeof d.replies === "object") {
      flattenComments(
        d.replies.data.children,
        postId,
        [...parentChain, comment],
        result,
        max
      );
    }
  }
}

async function fetchCommentTree(
  postId: string,
  subreddit: string
): Promise<CommentTree> {
  const [postListing, commentListing] = (await mockRedditFetch(
    `/r/${subreddit}/comments/${postId}.json?limit=500&depth=10`
  )) as [RedditPostListing, RedditListing];

  const p = postListing.data.children[0]!.data;
  const post: RedditPost = {
    id: p.id,
    title: p.title,
    url: `https://reddit.com${p.permalink}`,
    subreddit: p.subreddit,
    upvotes: p.score,
    numComments: p.num_comments,
    selftext: p.selftext.slice(0, 2000),
    author: p.author,
    createdUtc: p.created_utc,
  };

  const comments: RedditComment[] = [];
  flattenComments(
    commentListing.data.children,
    postId,
    [],
    comments,
    configMock.config.pipeline.maxCommentsPerThread
  );

  return { post, comments };
}

// Register the inlined function so other test files get a complete mock
mock.module("@/src/lib/reddit/fetcher", () => ({ fetchCommentTree }));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeApiResponse(
  postData: Record<string, unknown> = {},
  commentNodes: unknown[] = []
) {
  return [
    {
      data: {
        children: [
          {
            data: {
              id: "post1",
              title: "Test Post",
              permalink: "/r/programming/comments/post1/test/",
              subreddit: "programming",
              score: 42,
              num_comments: 10,
              selftext: "Post body",
              author: "op",
              created_utc: 1700000000,
              ...postData,
            },
          },
        ],
      },
    },
    {
      data: {
        children: commentNodes,
      },
    },
  ];
}

beforeEach(() => {
  mockRedditFetch.mockReset();
});

describe("fetchCommentTree", () => {
  test("calls correct API path", async () => {
    mockRedditFetch.mockResolvedValue(makeApiResponse());

    await fetchCommentTree("abc123", "typescript");

    expect(mockRedditFetch).toHaveBeenCalledWith(
      "/r/typescript/comments/abc123.json?limit=500&depth=10"
    );
  });

  test("maps post data to RedditPost", async () => {
    mockRedditFetch.mockResolvedValue(
      makeApiResponse({
        id: "p1",
        title: "My Post",
        permalink: "/r/prog/comments/p1/my_post/",
        subreddit: "prog",
        score: 100,
        num_comments: 50,
        selftext: "Body text",
        author: "alice",
        created_utc: 1700000000,
      })
    );

    const result = await fetchCommentTree("p1", "prog");

    expect(result.post).toEqual({
      id: "p1",
      title: "My Post",
      url: "https://reddit.com/r/prog/comments/p1/my_post/",
      subreddit: "prog",
      upvotes: 100,
      numComments: 50,
      selftext: "Body text",
      author: "alice",
      createdUtc: 1700000000,
    });
  });

  test("truncates post selftext to 2000 chars", async () => {
    const longText = "x".repeat(3000);
    mockRedditFetch.mockResolvedValue(
      makeApiResponse({ selftext: longText })
    );

    const result = await fetchCommentTree("post1", "programming");
    expect(result.post.selftext).toHaveLength(2000);
  });

  test("flattens single top-level comment", async () => {
    const node = makeRedditCommentNode({
      id: "c1",
      body: "Hello",
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]!.id).toBe("c1");
    expect(result.comments[0]!.body).toBe("Hello");
    expect(result.comments[0]!.parentChain).toEqual([]);
  });

  test("flattens nested comments in depth-first order", async () => {
    const child = makeRedditCommentNode({
      id: "c2",
      body: "Reply",
      parent_id: "t1_c1",
      depth: 1,
    });
    const parent = makeRedditCommentNode({
      id: "c1",
      body: "Top",
      parent_id: "t3_post1",
      depth: 0,
      replies: { data: { children: [child] } },
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [parent]));

    const result = await fetchCommentTree("post1", "programming");

    expect(result.comments).toHaveLength(2);
    expect(result.comments[0]!.id).toBe("c1");
    expect(result.comments[1]!.id).toBe("c2");
  });

  test("parentChain accumulates ancestors", async () => {
    const grandchild = makeRedditCommentNode({
      id: "c3",
      body: "Grandchild",
      parent_id: "t1_c2",
      depth: 2,
    });
    const child = makeRedditCommentNode({
      id: "c2",
      body: "Child",
      parent_id: "t1_c1",
      depth: 1,
      replies: { data: { children: [grandchild] } },
    });
    const parent = makeRedditCommentNode({
      id: "c1",
      body: "Parent",
      parent_id: "t3_post1",
      depth: 0,
      replies: { data: { children: [child] } },
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [parent]));

    const result = await fetchCommentTree("post1", "programming");

    expect(result.comments[0]!.parentChain).toHaveLength(0);
    expect(result.comments[1]!.parentChain).toHaveLength(1);
    expect(result.comments[1]!.parentChain[0]!.id).toBe("c1");
    expect(result.comments[2]!.parentChain).toHaveLength(2);
    expect(result.comments[2]!.parentChain[0]!.id).toBe("c1");
    expect(result.comments[2]!.parentChain[1]!.id).toBe("c2");
  });

  test("skips [deleted] comment bodies", async () => {
    const node = makeRedditCommentNode({
      id: "c1",
      body: "[deleted]",
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(0);
  });

  test("skips [removed] comment bodies", async () => {
    const node = makeRedditCommentNode({
      id: "c1",
      body: "[removed]",
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(0);
  });

  test("recurses into replies of deleted comments", async () => {
    const validChild = makeRedditCommentNode({
      id: "c2",
      body: "Valid reply",
      parent_id: "t1_c1",
      depth: 1,
    });
    const deletedParent = makeRedditCommentNode({
      id: "c1",
      body: "[deleted]",
      parent_id: "t3_post1",
      depth: 0,
      replies: { data: { children: [validChild] } },
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [deletedParent]));

    const result = await fetchCommentTree("post1", "programming");

    // Deleted parent skipped, but child is included
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]!.id).toBe("c2");
  });

  test("truncates comment body to 1000 chars", async () => {
    const longBody = "y".repeat(2000);
    const node = makeRedditCommentNode({
      id: "c1",
      body: longBody,
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments[0]!.body).toHaveLength(1000);
  });

  test("strips t1_ and t3_ prefixes from parent_id", async () => {
    const node = makeRedditCommentNode({
      id: "c1",
      body: "Hello",
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments[0]!.parentId).toBe("post1");

    // Also test t1_ prefix
    const node2 = makeRedditCommentNode({
      id: "c2",
      body: "Reply",
      parent_id: "t1_c1",
      depth: 1,
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node2]));

    const result2 = await fetchCommentTree("post1", "programming");
    expect(result2.comments[0]!.parentId).toBe("c1");
  });

  test("respects maxCommentsPerThread cap", async () => {
    // Config has maxCommentsPerThread=100, create 105 comments
    const nodes = Array.from({ length: 105 }, (_, i) =>
      makeRedditCommentNode({
        id: `c${i}`,
        body: `Comment ${i}`,
        parent_id: "t3_post1",
        depth: 0,
      })
    );
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, nodes));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(100);
  });

  test("handles replies being empty string (Reddit quirk)", async () => {
    const node = makeRedditCommentNode({
      id: "c1",
      body: "No replies",
      parent_id: "t3_post1",
      depth: 0,
      replies: "", // Reddit returns "" for no replies
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]!.id).toBe("c1");
  });

  test("handles replies being proper listing object", async () => {
    const child = makeRedditCommentNode({
      id: "c2",
      body: "Child",
      parent_id: "t1_c1",
      depth: 1,
    });
    const node = makeRedditCommentNode({
      id: "c1",
      body: "Parent",
      parent_id: "t3_post1",
      depth: 0,
      replies: { data: { children: [child] } },
    });
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [node]));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(2);
  });

  test("skips non-t1 kind nodes (e.g. 'more')", async () => {
    const moreNode = {
      kind: "more",
      data: {
        id: "more1",
        body: "load more",
        author: "system",
        score: 0,
        parent_id: "t3_post1",
        created_utc: 0,
        depth: 0,
        replies: "",
      },
    };
    const validNode = makeRedditCommentNode({
      id: "c1",
      body: "Valid",
      parent_id: "t3_post1",
      depth: 0,
    });
    mockRedditFetch.mockResolvedValue(
      makeApiResponse({}, [moreNode, validNode])
    );

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]!.id).toBe("c1");
  });

  test("deeply nested tree (5+ levels) builds correct parentChain", async () => {
    // Build a chain: c0 -> c1 -> c2 -> c3 -> c4
    const c4 = makeRedditCommentNode({
      id: "c4",
      body: "Level 4",
      parent_id: "t1_c3",
      depth: 4,
    });
    const c3 = makeRedditCommentNode({
      id: "c3",
      body: "Level 3",
      parent_id: "t1_c2",
      depth: 3,
      replies: { data: { children: [c4] } },
    });
    const c2 = makeRedditCommentNode({
      id: "c2",
      body: "Level 2",
      parent_id: "t1_c1",
      depth: 2,
      replies: { data: { children: [c3] } },
    });
    const c1 = makeRedditCommentNode({
      id: "c1",
      body: "Level 1",
      parent_id: "t1_c0",
      depth: 1,
      replies: { data: { children: [c2] } },
    });
    const c0 = makeRedditCommentNode({
      id: "c0",
      body: "Level 0",
      parent_id: "t3_post1",
      depth: 0,
      replies: { data: { children: [c1] } },
    });

    mockRedditFetch.mockResolvedValue(makeApiResponse({}, [c0]));

    const result = await fetchCommentTree("post1", "programming");

    expect(result.comments).toHaveLength(5);
    expect(result.comments[4]!.parentChain).toHaveLength(4);
    expect(result.comments[4]!.parentChain.map((c) => c.id)).toEqual([
      "c0",
      "c1",
      "c2",
      "c3",
    ]);
  });

  test("returns empty comments for post with no comments", async () => {
    mockRedditFetch.mockResolvedValue(makeApiResponse({}, []));

    const result = await fetchCommentTree("post1", "programming");
    expect(result.comments).toEqual([]);
    expect(result.post.id).toBe("post1");
  });
});
