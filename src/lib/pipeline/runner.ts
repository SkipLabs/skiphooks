import { loadPipelineConfig } from "@/src/lib/config";
import { fetchNewPosts } from "@/src/lib/reddit/crawler";
import { fetchCommentTree } from "@/src/lib/reddit/fetcher";
import { scoreThreadBatch } from "@/src/lib/scoring/thread";
import { scoreComments } from "@/src/lib/scoring/comment";
import {
  createCrawlRun,
  completeCrawlRun,
  threadExists,
  saveThreadWithComments,
} from "@/src/lib/db/repository";

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason;
}

export interface RunOptions {
  subreddits?: string[];
  maxPosts?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
}

export interface RunResult {
  threadsScanned: number;
  threadsSaved: number;
  commentsSaved: number;
  durationMs: number;
  aborted?: boolean;
}

export async function runPipeline(
  options?: RunOptions
): Promise<RunResult> {
  const startTime = Date.now();
  const signal = options?.signal;
  const dryRun = options?.dryRun ?? false;

  // Load config from DB (falls back to env vars)
  const pipelineConfig = await loadPipelineConfig();

  const subreddits = options?.subreddits ?? pipelineConfig.subreddits;
  const scoring = {
    topicDescription: pipelineConfig.topicDescription,
    replyPersona: pipelineConfig.replyPersona,
    threadThreshold: pipelineConfig.threadThreshold,
    commentThreshold: pipelineConfig.commentThreshold,
  };

  // 1. Create crawl run
  const crawlRun = dryRun
    ? { id: "dry-run", startedAt: new Date(), completedAt: null, subreddits, threadsScanned: 0, threadsSaved: 0, commentsSaved: 0, errorMessage: null }
    : await createCrawlRun(subreddits);

  let threadsScanned = 0;
  let threadsSaved = 0;
  let commentsSaved = 0;

  try {
    checkAbort(signal);

    // 2. Fetch new posts
    const posts = await fetchNewPosts(subreddits, options?.maxPosts);
    threadsScanned = posts.length;

    checkAbort(signal);

    // 3. Score threads in batches of 20
    const allScores = [];
    for (let i = 0; i < posts.length; i += 20) {
      checkAbort(signal);
      const batch = posts.slice(i, i + 20);
      const scores = await scoreThreadBatch(batch, scoring);
      allScores.push(...scores);
    }

    // Keep only dive_in threads above threshold
    const passingThreads = allScores.filter(
      (s) =>
        s.verdict === "dive_in" &&
        s.relevanceScore >= scoring.threadThreshold
    );

    checkAbort(signal);

    // 4. For each passing thread (errors are isolated per-thread)
    for (let ti = 0; ti < passingThreads.length; ti++) {
      checkAbort(signal);

      // Rate limit between Reddit API calls
      if (ti > 0) await abortableSleep(pipelineConfig.rateLimitMs, signal);
      const threadScore = passingThreads[ti]!;
      const post = posts.find((p) => p.id === threadScore.postId);
      if (!post) continue;

      try {
        // 4a. Skip if thread already exists
        if (await threadExists(post.id)) continue;

        // 4b. Fetch comment tree
        const tree = await fetchCommentTree(post.id, post.subreddit);

        // 4c. Score comments (already filtered by threshold)
        const commentScores = await scoreComments(tree, scoring);

        // 4d. Skip threads with no scorable comments
        if (commentScores.length === 0) continue;

        // 4e. Persist if not dry run
        if (!dryRun) {
          const queueItems = commentScores
            .map((cs) => {
              const comment = tree.comments.find((c) => c.id === cs.commentId);
              if (!comment) return null;
              return {
                commentId: cs.commentId,
                commentBody: comment.body,
                commentUrl: `https://reddit.com/r/${post.subreddit}/comments/${post.id}/_/${cs.commentId}/`,
                author: comment.author,
                upvotes: comment.upvotes,
                depth: comment.depth,
                relevanceScore: cs.relevanceScore,
                reasoning: cs.reasoning,
                replyAngle: cs.replyAngle,
                urgency: cs.urgency,
                status: "pending" as const,
                parentChain: comment.parentChain,
                repliedAt: null,
                notes: null,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

          // Save thread + all comments atomically in a transaction
          await saveThreadWithComments(
            {
              postId: post.id,
              title: post.title,
              url: post.url,
              subreddit: post.subreddit,
              relevanceScore: threadScore.relevanceScore,
              reasoning: threadScore.reasoning,
              suggestedTopics: threadScore.suggestedTopics,
            },
            queueItems
          );

          commentsSaved += queueItems.length;
          threadsSaved++;
        } else {
          threadsSaved++;
          commentsSaved += commentScores.length;
        }
      } catch (error) {
        // Don't swallow abort errors
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        console.error(
          `Failed to process thread ${post.id} in r/${post.subreddit}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue processing remaining threads
      }
    }

    // 5. Complete crawl run
    if (!dryRun) {
      await completeCrawlRun(crawlRun.id, {
        threadsScanned,
        threadsSaved,
        commentsSaved,
      });
    }
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";

    if (!dryRun) {
      await completeCrawlRun(crawlRun.id, {
        threadsScanned,
        threadsSaved,
        commentsSaved,
        errorMessage: isAbort ? "aborted" : (error instanceof Error ? error.message : String(error)),
      });
    }

    if (isAbort) {
      return {
        threadsScanned,
        threadsSaved,
        commentsSaved,
        durationMs: Date.now() - startTime,
        aborted: true,
      };
    }

    throw error;
  }

  // 6. Return result
  return {
    threadsScanned,
    threadsSaved,
    commentsSaved,
    durationMs: Date.now() - startTime,
  };
}
