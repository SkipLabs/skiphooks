import type { RedditPost } from "@/src/types/reddit";
import type { ThreadScore, ScoringConfig } from "@/src/types/scoring";
import { getAnthropicClient } from "./client";
import { config as appConfig } from "@/src/lib/config";

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

export async function scoreThreadBatch(
  posts: RedditPost[],
  config: ScoringConfig
): Promise<ThreadScore[]> {
  if (posts.length === 0) return [];
  if (posts.length > 20) {
    throw new Error("scoreThreadBatch: max 20 posts per call");
  }

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: appConfig.anthropic.model,
    max_tokens: 4096,
    system: buildSystemPrompt(config),
    messages: [
      {
        role: "user",
        content: buildUserMessage(posts),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";

  return parseResponse(text, posts);
}
