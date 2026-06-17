import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { formatPosts, fmtTimestamp, fetchGroupPosts, type PostNode } from "./summary-utils";

function makePost(overrides: Partial<PostNode> = {}): PostNode {
  return {
    id: "post-1",
    markdown: "Hello world",
    created: "2026-06-12T10:00:00.000Z",
    author: { id: "user-1", name: "Alice" },
    comments: { edges: [] },
    ...overrides,
  };
}

// Build a single-page GraphQL response for fetch__Group.posts
function postsResponse(nodes: PostNode[], hasNextPage = false): Response {
  return new Response(
    JSON.stringify({
      data: {
        fetch__Group: {
          name: "Test Group",
          posts: {
            pageInfo: { hasNextPage, endCursor: hasNextPage ? "cursor-1" : null },
            edges: nodes.map((node) => ({ node })),
          },
        },
      },
    }),
    { status: 200 },
  );
}

describe("formatPosts", () => {
  test("empty array returns empty string", () => {
    expect(formatPosts([])).toBe("");
  });

  test("formats a post with no comments", () => {
    const result = formatPosts([makePost()]);
    expect(result).toContain("--- Alice [2026-06-12 10:00] ---");
    expect(result).toContain("Hello world");
  });

  test("formats comments under a post", () => {
    const post = makePost({
      comments: {
        edges: [
          {
            node: {
              markdown: "A comment",
              created: "2026-06-12T11:00:00.000Z",
              author: { name: "Bob" },
              replies: { edges: [] },
            },
          },
        ],
      },
    });
    const result = formatPosts([post]);
    expect(result).toContain("  > Bob [2026-06-12 11:00]:");
    expect(result).toContain("  A comment");
  });

  test("formats replies under comments", () => {
    const post = makePost({
      comments: {
        edges: [
          {
            node: {
              markdown: "A comment",
              created: "2026-06-12T11:00:00.000Z",
              author: { name: "Bob" },
              replies: {
                edges: [
                  {
                    node: {
                      markdown: "A reply",
                      created: "2026-06-12T12:00:00.000Z",
                      author: { name: "Carol" },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const result = formatPosts([post]);
    expect(result).toContain("    >> Carol [2026-06-12 12:00]:");
    expect(result).toContain("    A reply");
  });

  test("separates multiple posts with blank lines", () => {
    const posts = [
      makePost({
        id: "1",
        markdown: "First post",
        author: { id: "u1", name: "Alice" },
      }),
      makePost({
        id: "2",
        markdown: "Second post",
        author: { id: "u2", name: "Bob" },
        created: "2026-06-12T11:00:00.000Z",
      }),
    ];
    const result = formatPosts(posts);
    expect(result).toContain("First post");
    expect(result).toContain("Second post");
    expect(result).toContain("--- Alice");
    expect(result).toContain("--- Bob");
    const blankLines = result.match(/\n\n/g);
    expect(blankLines).not.toBeNull();
  });
});

describe("fmtTimestamp", () => {
  test("formats an ISO timestamp as 'YYYY-MM-DD HH:MM' in UTC", () => {
    expect(fmtTimestamp("2026-06-12T10:00:00.000Z")).toBe("2026-06-12 10:00");
  });

  test("normalizes a timezone offset to UTC", () => {
    // 05:00 at +02:00 is 03:00 UTC
    expect(fmtTimestamp("2026-06-12T05:00:00+02:00")).toBe("2026-06-12 03:00");
  });
});

describe("fetchGroupPosts", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("filters by the true instant, not lexical string order", async () => {
    const start = "2026-06-12T04:00:00.000Z";
    const end = "2026-06-12T20:00:00.000Z";

    // inWindow: 10:00 UTC — clearly inside
    const inWindow = makePost({ id: "in", created: "2026-06-12T10:00:00Z" });
    // beforeStart: 05:00+02:00 == 03:00 UTC — BEFORE the window, but lexically
    // "05:00:00+02:00" > "04:00:00.000Z", so a string comparison would wrongly keep it.
    const beforeStart = makePost({ id: "before", created: "2026-06-12T05:00:00+02:00" });

    globalThis.fetch = mock(() =>
      Promise.resolve(postsResponse([inWindow, beforeStart])),
    ) as unknown as typeof fetch;

    const posts = await fetchGroupPosts("https://gql.example.com", "tok", "group-1", start, end);
    const ids = posts.map((p) => p.id);
    expect(ids).toContain("in");
    expect(ids).not.toContain("before");
  });

  test("excludes posts after the window end", async () => {
    const start = "2026-06-12T00:00:00.000Z";
    const end = "2026-06-12T12:00:00.000Z";
    const after = makePost({ id: "after", created: "2026-06-12T18:00:00Z" });
    const inside = makePost({ id: "inside", created: "2026-06-12T06:00:00Z" });

    globalThis.fetch = mock(() =>
      Promise.resolve(postsResponse([after, inside])),
    ) as unknown as typeof fetch;

    const posts = await fetchGroupPosts("https://gql.example.com", "tok", "group-1", start, end);
    expect(posts.map((p) => p.id)).toEqual(["inside"]);
  });

  test("retries a transient 503 via fetchWithRetry", async () => {
    const start = "2026-06-12T00:00:00.000Z";
    const end = "2026-06-12T23:59:59.999Z";
    const post = makePost({ id: "ok", created: "2026-06-12T10:00:00Z" });

    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      if (calls === 1) return Promise.resolve(new Response("unavailable", { status: 503 }));
      return Promise.resolve(postsResponse([post]));
    }) as unknown as typeof fetch;

    const posts = await fetchGroupPosts("https://gql.example.com", "tok", "group-1", start, end);
    expect(calls).toBe(2);
    expect(posts.map((p) => p.id)).toEqual(["ok"]);
  });

  test("throws on GraphQL errors in the response body", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: "group not found" }] }), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      fetchGroupPosts("https://gql.example.com", "tok", "group-1", "2026-06-12T00:00:00Z", "2026-06-12T23:59:59Z"),
    ).rejects.toThrow("group not found");
  });
});
