import type { CommentTree, RedditComment } from "@/src/types/reddit";
import type { CommentScore, CommentVerdict, ScoringConfig } from "@/src/types/scoring";
import { getAnthropicClient } from "./client";
import { config as appConfig } from "@/src/lib/config";

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
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: appConfig.anthropic.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: buildUserMessage(batch) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let results: ClaudeCommentResult[];
  try {
    results = JSON.parse(textBlock.text);
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

export async function scoreComments(
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
