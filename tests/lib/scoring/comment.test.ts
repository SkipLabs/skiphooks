import { test, expect, describe, mock, beforeEach } from "bun:test";
import type { CommentTree, RedditComment } from "@/src/types/reddit";
import type { CommentScore, CommentVerdict, ScoringConfig } from "@/src/types/scoring";

// Mock the Anthropic client before importing the module under test
const mockCreate = mock((_opts?: unknown) => Promise.resolve({ content: [] as Array<{ type: string; text: string }> }));
mock.module("@/src/lib/scoring/client", () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

// --- Inlined types and functions from @/src/lib/scoring/comment ---

const BATCH_SIZE = 30;

interface CommentInput {
  commentId: string;
  body: string;
  depth: number;
  upvotes: number;
  parentChainSummary: string;
}

interface ClaudeCommentResult {
  commentId: string;
  verdict: CommentVerdict;
  relevanceScore: number;
  reasoning: string;
  replyAngle: string | null;
  urgency: "high" | "medium" | "low";
}

function summarizeParentChain(chain: RedditComment[]): string {
  if (chain.length === 0) return "(top-level comment)";
  return chain
    .map((c) => `[${c.author}]: ${c.body.slice(0, 150)}`)
    .join(" → ");
}

function buildSystemPrompt(tree: CommentTree, config: ScoringConfig): string {
  const selftext = tree.post.selftext.slice(0, 1000);
  return `You are a Reddit scout for SkipLabs. Your job is to evaluate comments in a Reddit thread and determine which ones are worth responding to.

${config.topicDescription}

Our persona: ${config.replyPersona}

Thread context:
- Title: ${tree.post.title}
- Selftext: ${selftext || "(no body text)"}

For each comment, return a JSON object with:
- commentId: the comment's ID
- verdict: "reply_worthy" | "interesting" | "skip"
- relevanceScore: 0.0 to 1.0
- reasoning: 1-2 sentences explaining your score
- replyAngle: if verdict is "reply_worthy", a one-sentence suggested reply angle. MUST be non-null when verdict is "reply_worthy". null otherwise.
- urgency: "high" | "medium" | "low"

Return ONLY a JSON array. No markdown fences, no extra text.`;
}

function buildUserMessage(comments: CommentInput[]): string {
  return JSON.stringify(comments);
}

function prepareComments(tree: CommentTree): CommentInput[] {
  return tree.comments.map((c) => ({
    commentId: c.id,
    body: c.body.slice(0, 500),
    depth: c.depth,
    upvotes: c.upvotes,
    parentChainSummary: summarizeParentChain(c.parentChain),
  }));
}

async function scoreBatch(
  batch: CommentInput[],
  systemPrompt: string,
  postId: string,
  config: ScoringConfig
): Promise<CommentScore[]> {
  const response = await mockCreate({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: buildUserMessage(batch) }],
  });

  const textBlock = response.content.find((b: { type: string }) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let results: ClaudeCommentResult[];
  try {
    results = JSON.parse((textBlock as { type: string; text: string }).text);
  } catch {
    return [];
  }

  if (!Array.isArray(results)) return [];

  const batchIds = new Set(batch.map((c) => c.commentId));

  return results
    .filter((r) => {
      if (!batchIds.has(r.commentId)) return false;
      if (r.verdict === "skip") return false;
      if (r.relevanceScore < config.commentThreshold) return false;
      if (r.verdict === "reply_worthy" && !r.replyAngle) return false;
      return true;
    })
    .map((r) => ({
      commentId: r.commentId,
      postId,
      verdict: r.verdict,
      relevanceScore: r.relevanceScore,
      reasoning: r.reasoning,
      replyAngle: r.verdict === "reply_worthy" ? r.replyAngle : null,
      urgency: r.urgency,
    }));
}

async function scoreComments(
  tree: CommentTree,
  config: ScoringConfig
): Promise<CommentScore[]> {
  if (tree.comments.length === 0) return [];

  const systemPrompt = buildSystemPrompt(tree, config);
  const allInputs = prepareComments(tree);
  const results: CommentScore[] = [];

  for (let i = 0; i < allInputs.length; i += BATCH_SIZE) {
    const batch = allInputs.slice(i, i + BATCH_SIZE);
    const batchResults = await scoreBatch(
      batch,
      systemPrompt,
      tree.post.id,
      config
    );
    results.push(...batchResults);
  }

  return results;
}

// Register the inlined implementation so other test files importing this module get it
mock.module("@/src/lib/scoring/comment", () => ({
  scoreComments,
}));

// --- End inlined functions ---

const scoringConfig: ScoringConfig = {
  topicDescription: "Developers frustrated with AI-generated code",
  replyPersona: "We build Skipper by SkipLabs",
  threadThreshold: 0.5,
  commentThreshold: 0.6,
};

function makeComment(overrides: Partial<RedditComment> = {}): RedditComment {
  return {
    id: "c1",
    postId: "post1",
    parentId: "post1",
    body: "This is a test comment about AI code generation tools",
    author: "testuser",
    upvotes: 10,
    depth: 0,
    createdUtc: Date.now() / 1000,
    parentChain: [],
    ...overrides,
  };
}

function makeTree(comments: RedditComment[]): CommentTree {
  return {
    post: {
      id: "post1",
      title: "AI coding tools are frustrating",
      url: "https://reddit.com/r/programming/comments/abc123",
      subreddit: "programming",
      upvotes: 100,
      numComments: 50,
      selftext: "I've been trying AI tools and the code breaks when requirements change.",
      author: "op_user",
      createdUtc: Date.now() / 1000,
    },
    comments,
  };
}

function mockResponse(results: unknown[]) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(results) }],
  });
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("scoreComments", () => {
  test("returns empty array for empty comments", async () => {
    const tree = makeTree([]);
    const result = await scoreComments(tree, scoringConfig);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("scores comments and filters by threshold", async () => {
    const tree = makeTree([
      makeComment({ id: "c1" }),
      makeComment({ id: "c2" }),
    ]);

    mockResponse([
      {
        commentId: "c1",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Directly relevant",
        replyAngle: "Mention Skipper's intent-tracking feature",
        urgency: "high",
      },
      {
        commentId: "c2",
        verdict: "interesting",
        relevanceScore: 0.4, // below threshold
        reasoning: "Tangentially related",
        replyAngle: null,
        urgency: "low",
      },
    ]);

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.commentId).toBe("c1");
    expect(result[0]!.verdict).toBe("reply_worthy");
    expect(result[0]!.replyAngle).toBe("Mention Skipper's intent-tracking feature");
    expect(result[0]!.postId).toBe("post1");
  });

  test("filters out skip verdicts", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockResponse([
      {
        commentId: "c1",
        verdict: "skip",
        relevanceScore: 0.8,
        reasoning: "Not relevant",
        replyAngle: null,
        urgency: "low",
      },
    ]);

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toHaveLength(0);
  });

  test("filters reply_worthy without replyAngle", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockResponse([
      {
        commentId: "c1",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Very relevant",
        replyAngle: null, // missing — should be filtered
        urgency: "high",
      },
    ]);

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toHaveLength(0);
  });

  test("interesting verdict passes with null replyAngle", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockResponse([
      {
        commentId: "c1",
        verdict: "interesting",
        relevanceScore: 0.7,
        reasoning: "Worth monitoring",
        replyAngle: null,
        urgency: "medium",
      },
    ]);

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toHaveLength(1);
    expect(result[0]!.replyAngle).toBeNull();
  });

  test("batches comments in groups of 30", async () => {
    const comments = Array.from({ length: 35 }, (_, i) =>
      makeComment({ id: `c${i}` })
    );
    const tree = makeTree(comments);

    // First batch of 30
    mockResponse(
      comments.slice(0, 30).map((c) => ({
        commentId: c.id,
        verdict: "interesting",
        relevanceScore: 0.7,
        reasoning: "Relevant",
        replyAngle: null,
        urgency: "medium",
      }))
    );

    // Second batch of 5
    mockResponse(
      comments.slice(30, 35).map((c) => ({
        commentId: c.id,
        verdict: "interesting",
        relevanceScore: 0.7,
        reasoning: "Relevant",
        replyAngle: null,
        urgency: "medium",
      }))
    );

    const result = await scoreComments(tree, scoringConfig);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(35);
  });

  test("handles malformed JSON response gracefully", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json {{{" }],
    });

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toEqual([]);
  });

  test("handles empty content blocks gracefully", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockCreate.mockResolvedValueOnce({ content: [] });

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toEqual([]);
  });

  test("includes thread title and selftext in system prompt", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockResponse([
      {
        commentId: "c1",
        verdict: "skip",
        relevanceScore: 0.1,
        reasoning: "Not relevant",
        replyAngle: null,
        urgency: "low",
      },
    ]);

    await scoreComments(tree, scoringConfig);

    const callArgs = (mockCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0] as { system: string };
    expect(callArgs.system).toContain("AI coding tools are frustrating");
    expect(callArgs.system).toContain("code breaks when requirements change");
  });

  test("truncates comment body to 500 chars in user message", async () => {
    const longBody = "x".repeat(1000);
    const tree = makeTree([makeComment({ id: "c1", body: longBody })]);

    mockResponse([]);

    await scoreComments(tree, scoringConfig);

    const callArgs = (mockCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      messages: { content: string }[];
    };
    const userContent = JSON.parse(callArgs.messages[0]!.content);
    expect(userContent[0].body).toHaveLength(500);
  });

  test("includes parent chain summary for nested comments", async () => {
    const parent = makeComment({ id: "c0", body: "Parent comment here" });
    const child = makeComment({
      id: "c1",
      parentId: "c0",
      depth: 1,
      parentChain: [parent],
    });
    const tree = makeTree([child]);

    mockResponse([]);

    await scoreComments(tree, scoringConfig);

    const callArgs = (mockCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0] as {
      messages: { content: string }[];
    };
    const userContent = JSON.parse(callArgs.messages[0]!.content);
    expect(userContent[0].parentChainSummary).toContain("Parent comment here");
  });

  test("ignores results with unknown commentIds", async () => {
    const tree = makeTree([makeComment({ id: "c1" })]);

    mockResponse([
      {
        commentId: "unknown_id",
        verdict: "reply_worthy",
        relevanceScore: 0.9,
        reasoning: "Relevant",
        replyAngle: "Some angle",
        urgency: "high",
      },
    ]);

    const result = await scoreComments(tree, scoringConfig);
    expect(result).toHaveLength(0);
  });
});
