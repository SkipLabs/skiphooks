import { test, expect, describe } from "bun:test";
import { formatPosts, type PostNode } from "./summary-utils";

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
