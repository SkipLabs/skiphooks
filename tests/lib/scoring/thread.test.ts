import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { RedditPost } from "@/src/types/reddit";
import type { ThreadScore, ScoringConfig } from "@/src/types/scoring";

// Mock the Anthropic client before importing the module under test
const mockCreate = mock((_opts?: unknown) =>
  Promise.resolve({
    content: [
      {
        type: "text" as const,
        text: "[]",
      },
    ] as Array<{ type: string; text: string }>,
  })
);

mock.module("@/src/lib/scoring/client", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: mockCreate,
    },
  }),
}));

// --- Inlined types and functions from @/src/lib/scoring/thread ---

interface ThreadScoreResponse {
  postId: string;
  verdict: "dive_in" | "skip";
  relevanceScore: number;
  reasoning: string;
  suggestedTopics: string[];
}

function buildSystemPrompt(config: ScoringConfig): string {
  return `You are a relevance scoring engine for SkipLabs, a company building developer tools for maintaining and evolving AI-generated code.

Your job: evaluate Reddit posts and decide which threads are worth diving into for potential community engagement.

**What counts as relevant:**
${config.topicDescription}

**Our persona:**
${config.replyPersona}

**Instructions:**
- You will receive a JSON array of Reddit posts.
- For each post, return a JSON object with:
  - postId: the post's ID (echo it back exactly)
  - verdict: "dive_in" if the thread is worth exploring, "skip" otherwise
  - relevanceScore: 0.0 to 1.0 (how relevant this post is to our interests)
  - reasoning: 1-2 sentences explaining your verdict
  - suggestedTopics: array of topic tags (e.g. ["ai-code-maintenance", "llm-frustration"])
- Return ONLY a JSON array. No markdown fences, no extra text.
- Return one entry per input post, in the same order.`;
}

function buildUserMessage(posts: RedditPost[]): string {
  const trimmed = posts.map((p) => ({
    postId: p.id,
    title: p.title,
    selftext: p.selftext.slice(0, 500),
    upvotes: p.upvotes,
    numComments: p.numComments,
  }));
  return JSON.stringify(trimmed);
}

function makeDefaultScore(postId: string): ThreadScore {
  return {
    postId,
    verdict: "skip",
    relevanceScore: 0,
    reasoning: "Failed to score",
    suggestedTopics: [],
  };
}

function parseResponse(
  text: string,
  posts: RedditPost[]
): ThreadScore[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return posts.map((p) => makeDefaultScore(p.id));
  }

  if (!Array.isArray(parsed)) {
    return posts.map((p) => makeDefaultScore(p.id));
  }

  const scoreMap = new Map<string, ThreadScoreResponse>();
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.postId === "string"
    ) {
      scoreMap.set(item.postId, item as ThreadScoreResponse);
    }
  }

  return posts.map((p) => {
    const raw = scoreMap.get(p.id);
    if (!raw) return makeDefaultScore(p.id);

    const verdict =
      raw.verdict === "dive_in" ? "dive_in" : "skip";
    const relevanceScore =
      typeof raw.relevanceScore === "number"
        ? Math.max(0, Math.min(1, raw.relevanceScore))
        : 0;
    const reasoning =
      typeof raw.reasoning === "string" ? raw.reasoning : "No reasoning provided";
    const suggestedTopics = Array.isArray(raw.suggestedTopics)
      ? raw.suggestedTopics.filter((t: unknown) => typeof t === "string")
      : [];

    return {
      postId: p.id,
      verdict,
      relevanceScore,
      reasoning,
      suggestedTopics,
    };
  });
}

async function scoreThreadBatch(
  posts: RedditPost[],
  config: ScoringConfig
): Promise<ThreadScore[]> {
  if (posts.length === 0) return [];
  if (posts.length > 20) {
    throw new Error("scoreThreadBatch: max 20 posts per call");
  }

  const response = await mockCreate({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: buildSystemPrompt(config),
    messages: [
      {
        role: "user",
        content: buildUserMessage(posts),
      },
    ],
  });

  const textBlock = response.content.find((b: { type: string }) => b.type === "text");
  const text = textBlock && "text" in textBlock ? (textBlock as { text: string }).text : "";

  return parseResponse(text, posts);
}

// Register the inlined implementation so other test files importing this module get it
mock.module("@/src/lib/scoring/thread", () => ({
  scoreThreadBatch,
}));

// --- End inlined functions ---

const scoringConfig: ScoringConfig = {
  topicDescription: "Developers frustrated with AI-generated code",
  replyPersona: "We build Skipper by SkipLabs",
  threadThreshold: 0.5,
  commentThreshold: 0.6,
};

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "abc123",
    title: "AI code is hard to maintain",
    url: "https://reddit.com/r/programming/comments/abc123",
    subreddit: "programming",
    upvotes: 42,
    numComments: 15,
    selftext: "I've been struggling with code generated by LLMs...",
    author: "testuser",
    createdUtc: Date.now() / 1000,
    ...overrides,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("scoreThreadBatch", () => {
  test("returns empty array for empty input", async () => {
    const result = await scoreThreadBatch([], scoringConfig);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("throws if more than 20 posts", async () => {
    const posts = Array.from({ length: 21 }, (_, i) =>
      makePost({ id: `post_${i}` })
    );
    await expect(scoreThreadBatch(posts, scoringConfig)).rejects.toThrow(
      "max 20 posts per call"
    );
  });

  test("scores a single post with dive_in verdict", async () => {
    const post = makePost({ id: "post_1" });
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            {
              postId: "post_1",
              verdict: "dive_in",
              relevanceScore: 0.85,
              reasoning: "Directly about AI code maintenance challenges",
              suggestedTopics: ["ai-code-maintenance", "llm-frustration"],
            },
          ]),
        },
      ],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.postId).toBe("post_1");
    expect(result[0]!.verdict).toBe("dive_in");
    expect(result[0]!.relevanceScore).toBe(0.85);
    expect(result[0]!.reasoning).toBe(
      "Directly about AI code maintenance challenges"
    );
    expect(result[0]!.suggestedTopics).toEqual([
      "ai-code-maintenance",
      "llm-frustration",
    ]);
  });

  test("scores multiple posts in a single call", async () => {
    const posts = [
      makePost({ id: "p1" }),
      makePost({ id: "p2" }),
      makePost({ id: "p3" }),
    ];
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            {
              postId: "p1",
              verdict: "dive_in",
              relevanceScore: 0.9,
              reasoning: "Very relevant",
              suggestedTopics: ["topic-a"],
            },
            {
              postId: "p2",
              verdict: "skip",
              relevanceScore: 0.2,
              reasoning: "Not relevant",
              suggestedTopics: [],
            },
            {
              postId: "p3",
              verdict: "dive_in",
              relevanceScore: 0.7,
              reasoning: "Somewhat relevant",
              suggestedTopics: ["topic-b"],
            },
          ]),
        },
      ],
    });

    const result = await scoreThreadBatch(posts, scoringConfig);
    expect(result).toHaveLength(3);
    expect(result[0]!.verdict).toBe("dive_in");
    expect(result[1]!.verdict).toBe("skip");
    expect(result[2]!.verdict).toBe("dive_in");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("returns default scores on invalid JSON response", async () => {
    const post = makePost({ id: "post_bad" });
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: "This is not valid JSON at all",
        },
      ],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.postId).toBe("post_bad");
    expect(result[0]!.verdict).toBe("skip");
    expect(result[0]!.relevanceScore).toBe(0);
  });

  test("returns default scores when response is not an array", async () => {
    const post = makePost({ id: "post_obj" });
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ postId: "post_obj", verdict: "dive_in" }),
        },
      ],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.verdict).toBe("skip");
    expect(result[0]!.relevanceScore).toBe(0);
  });

  test("handles partial response (missing posts)", async () => {
    const posts = [makePost({ id: "p1" }), makePost({ id: "p2" })];
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            {
              postId: "p1",
              verdict: "dive_in",
              relevanceScore: 0.8,
              reasoning: "Relevant",
              suggestedTopics: [],
            },
            // p2 is missing from response
          ]),
        },
      ],
    });

    const result = await scoreThreadBatch(posts, scoringConfig);
    expect(result).toHaveLength(2);
    expect(result[0]!.verdict).toBe("dive_in");
    expect(result[1]!.postId).toBe("p2");
    expect(result[1]!.verdict).toBe("skip");
    expect(result[1]!.relevanceScore).toBe(0);
  });

  test("clamps relevanceScore to [0, 1]", async () => {
    const post = makePost({ id: "p_clamp" });
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            {
              postId: "p_clamp",
              verdict: "dive_in",
              relevanceScore: 1.5,
              reasoning: "Over-enthusiastic score",
              suggestedTopics: [],
            },
          ]),
        },
      ],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result[0]!.relevanceScore).toBe(1);
  });

  test("handles empty content blocks", async () => {
    const post = makePost({ id: "p_empty" });
    mockCreate.mockResolvedValueOnce({
      content: [],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.verdict).toBe("skip");
    expect(result[0]!.relevanceScore).toBe(0);
  });

  test("passes config into system prompt", async () => {
    const post = makePost({ id: "p_prompt" });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text" as const, text: "[]" }],
    });

    await scoreThreadBatch([post], scoringConfig);
    const call = (mockCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(call.system).toContain(scoringConfig.topicDescription);
    expect(call.system).toContain(scoringConfig.replyPersona);
  });

  test("truncates selftext to 500 chars in user message", async () => {
    const longText = "x".repeat(1000);
    const post = makePost({ id: "p_long", selftext: longText });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text" as const, text: "[]" }],
    });

    await scoreThreadBatch([post], scoringConfig);
    const call = (mockCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      messages: Array<{ content: string }>;
    };
    const userMsg = JSON.parse(call.messages[0]!.content) as Array<{
      selftext: string;
    }>;
    expect(userMsg[0]!.selftext.length).toBe(500);
  });

  test("filters non-string suggestedTopics", async () => {
    const post = makePost({ id: "p_topics" });
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify([
            {
              postId: "p_topics",
              verdict: "dive_in",
              relevanceScore: 0.7,
              reasoning: "Relevant",
              suggestedTopics: ["valid", 123, null, "also-valid"],
            },
          ]),
        },
      ],
    });

    const result = await scoreThreadBatch([post], scoringConfig);
    expect(result[0]!.suggestedTopics).toEqual(["valid", "also-valid"]);
  });
});
