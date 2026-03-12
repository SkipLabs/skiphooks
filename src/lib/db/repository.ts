import { getDb } from "./client";
import type {
  SavedThread,
  QueueItem,
  QueueItemWithThread,
  QueueFilter,
  CrawlRun,
  QueueItemStatus,
  ScoutConfigRow,
  ScoutConfigInput,
} from "@/src/types/storage";
import type { RedditComment } from "@/src/types/reddit";

// --- Threads ---

export async function saveThread(
  thread: Omit<SavedThread, "id" | "savedAt">
): Promise<SavedThread> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO saved_threads (
      post_id, title, url, subreddit,
      relevance_score, reasoning, suggested_topics
    ) VALUES (
      ${thread.postId}, ${thread.title}, ${thread.url}, ${thread.subreddit},
      ${thread.relevanceScore}, ${thread.reasoning}, ${thread.suggestedTopics}
    )
    RETURNING *
  `;
  return mapThread(rows[0]!);
}

export async function threadExists(postId: string): Promise<boolean> {
  const sql = getDb();
  const [row] = await sql`
    SELECT 1 FROM saved_threads WHERE post_id = ${postId} LIMIT 1
  `;
  return !!row;
}

// --- Queue items ---

export async function saveQueueItem(
  item: Omit<QueueItem, "id" | "savedAt">
): Promise<QueueItem> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO queue_items (
      thread_id, comment_id, comment_body, comment_url,
      author, upvotes, depth, relevance_score, reasoning,
      reply_angle, urgency, status, parent_chain, replied_at, notes
    ) VALUES (
      ${item.threadId}, ${item.commentId}, ${item.commentBody}, ${item.commentUrl},
      ${item.author}, ${item.upvotes}, ${item.depth}, ${item.relevanceScore},
      ${item.reasoning}, ${item.replyAngle}, ${item.urgency}, ${item.status},
      ${JSON.stringify(item.parentChain)}, ${item.repliedAt}, ${item.notes}
    )
    RETURNING *
  `;
  return mapQueueItem(rows[0]!);
}

export async function commentExists(commentId: string): Promise<boolean> {
  const sql = getDb();
  const [row] = await sql`
    SELECT 1 FROM queue_items WHERE comment_id = ${commentId} LIMIT 1
  `;
  return !!row;
}

export async function saveThreadWithComments(
  thread: Omit<SavedThread, "id" | "savedAt">,
  items: Omit<QueueItem, "id" | "savedAt" | "threadId">[]
): Promise<{ thread: SavedThread; comments: QueueItem[] }> {
  const sql = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    const threadRows = await tx`
      INSERT INTO saved_threads (
        post_id, title, url, subreddit,
        relevance_score, reasoning, suggested_topics
      ) VALUES (
        ${thread.postId}, ${thread.title}, ${thread.url}, ${thread.subreddit},
        ${thread.relevanceScore}, ${thread.reasoning}, ${thread.suggestedTopics}
      )
      RETURNING *
    `;
    const savedThread = mapThread(threadRows[0]!);

    const savedItems: QueueItem[] = [];
    for (const item of items) {
      // Skip comments that already exist (e.g. from a previous partial run)
      const [existing] = await tx`
        SELECT 1 FROM queue_items WHERE comment_id = ${item.commentId} LIMIT 1
      `;
      if (existing) continue;

      const rows = await tx`
        INSERT INTO queue_items (
          thread_id, comment_id, comment_body, comment_url,
          author, upvotes, depth, relevance_score, reasoning,
          reply_angle, urgency, status, parent_chain, replied_at, notes
        ) VALUES (
          ${savedThread.id}, ${item.commentId}, ${item.commentBody}, ${item.commentUrl},
          ${item.author}, ${item.upvotes}, ${item.depth}, ${item.relevanceScore},
          ${item.reasoning}, ${item.replyAngle}, ${item.urgency}, ${item.status},
          ${JSON.stringify(item.parentChain)}, ${item.repliedAt}, ${item.notes}
        )
        RETURNING *
      `;
      savedItems.push(mapQueueItem(rows[0]!));
    }

    return { thread: savedThread, comments: savedItems };
  });
  return result;
}

export async function getQueue(
  filter?: QueueFilter
): Promise<QueueItemWithThread[]> {
  const sql = getDb();

  const statusFilter = filter?.status ? sql`AND q.status = ${filter.status}` : sql``;
  const urgencyFilter = filter?.urgency ? sql`AND q.urgency = ${filter.urgency}` : sql``;
  const subredditFilter = filter?.subreddit ? sql`AND t.subreddit = ${filter.subreddit}` : sql``;
  const minScoreFilter = filter?.minScore !== undefined ? sql`AND q.relevance_score >= ${filter.minScore}` : sql``;

  const rows = await sql`
    SELECT
      q.id, q.thread_id, q.comment_id, q.comment_body, q.comment_url,
      q.author, q.upvotes, q.depth, q.relevance_score, q.reasoning,
      q.reply_angle, q.urgency, q.status, q.parent_chain,
      q.saved_at, q.replied_at, q.notes,
      t.id AS t_id, t.post_id, t.title, t.url, t.subreddit,
      t.relevance_score AS t_relevance_score, t.reasoning AS t_reasoning,
      t.suggested_topics, t.saved_at AS t_saved_at
    FROM queue_items q
    JOIN saved_threads t ON q.thread_id = t.id
    WHERE 1=1
    ${statusFilter}
    ${urgencyFilter}
    ${subredditFilter}
    ${minScoreFilter}
    ORDER BY q.saved_at DESC
  `;

  return rows.map(mapQueueItemWithThread);
}

export async function updateQueueItem(
  id: string,
  updates: { status?: QueueItemStatus; notes?: string }
): Promise<QueueItem> {
  const sql = getDb();
  const setRepliedAt = updates.status === "replied";

  const rows = await sql`
    UPDATE queue_items
    SET
      status = COALESCE(${updates.status ?? null}, status),
      notes = COALESCE(${updates.notes ?? null}, notes),
      replied_at = CASE WHEN ${setRepliedAt} THEN NOW() ELSE replied_at END
    WHERE id = ${id}
    RETURNING *
  `;

  if (rows.length === 0) {
    throw new Error(`Queue item not found: ${id}`);
  }
  return mapQueueItem(rows[0]!);
}

// --- Crawl runs ---

export async function createCrawlRun(
  subreddits: string[]
): Promise<CrawlRun> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO crawl_runs (subreddits)
    VALUES (${subreddits})
    RETURNING *
  `;
  return mapCrawlRun(rows[0]!);
}

export async function completeCrawlRun(
  id: string,
  stats: {
    threadsScanned: number;
    threadsSaved: number;
    commentsSaved: number;
    errorMessage?: string;
  }
): Promise<CrawlRun> {
  const sql = getDb();
  const rows = await sql`
    UPDATE crawl_runs
    SET
      completed_at = NOW(),
      threads_scanned = ${stats.threadsScanned},
      threads_saved = ${stats.threadsSaved},
      comments_saved = ${stats.commentsSaved},
      error_message = ${stats.errorMessage ?? null}
    WHERE id = ${id}
    RETURNING *
  `;
  return mapCrawlRun(rows[0]!);
}

// --- Read queries for dashboard ---

export async function getRecentCrawlRuns(limit = 10): Promise<CrawlRun[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM crawl_runs
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapCrawlRun);
}

export async function getSavedThreads(limit = 50): Promise<SavedThread[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM saved_threads
    ORDER BY saved_at DESC
    LIMIT ${limit}
  `;
  return rows.map(mapThread);
}

export async function getScoutStats(): Promise<{
  totalThreads: number;
  totalComments: number;
  pendingComments: number;
  totalRuns: number;
}> {
  const sql = getDb();
  const [[threads], [comments], [pending], [runs]] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM saved_threads`,
    sql`SELECT COUNT(*)::int AS count FROM queue_items`,
    sql`SELECT COUNT(*)::int AS count FROM queue_items WHERE status = 'pending'`,
    sql`SELECT COUNT(*)::int AS count FROM crawl_runs`,
  ]);
  return {
    totalThreads: (threads?.count as number) ?? 0,
    totalComments: (comments?.count as number) ?? 0,
    pendingComments: (pending?.count as number) ?? 0,
    totalRuns: (runs?.count as number) ?? 0,
  };
}

// --- Scout config ---

export async function getScoutConfig(): Promise<ScoutConfigRow | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM scout_config WHERE id = TRUE LIMIT 1`;
  if (rows.length === 0) return null;
  return mapScoutConfig(rows[0]!);
}

export async function upsertScoutConfig(
  config: ScoutConfigInput
): Promise<ScoutConfigRow> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO scout_config (
      id, subreddits, topic_description, reply_persona,
      thread_threshold, comment_threshold, rate_limit_ms, poll_interval_ms,
      updated_at
    ) VALUES (
      TRUE, ${config.subreddits}, ${config.topicDescription}, ${config.replyPersona},
      ${config.threadThreshold}, ${config.commentThreshold},
      ${config.rateLimitMs}, ${config.pollIntervalMs}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      subreddits = EXCLUDED.subreddits,
      topic_description = EXCLUDED.topic_description,
      reply_persona = EXCLUDED.reply_persona,
      thread_threshold = EXCLUDED.thread_threshold,
      comment_threshold = EXCLUDED.comment_threshold,
      rate_limit_ms = EXCLUDED.rate_limit_ms,
      poll_interval_ms = EXCLUDED.poll_interval_ms,
      updated_at = NOW()
    RETURNING *
  `;
  return mapScoutConfig(rows[0]!);
}

// --- Row mappers ---

function mapThread(row: Record<string, unknown>): SavedThread {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    title: row.title as string,
    url: row.url as string,
    subreddit: row.subreddit as string,
    relevanceScore: row.relevance_score as number,
    reasoning: row.reasoning as string,
    suggestedTopics: Array.isArray(row.suggested_topics) ? row.suggested_topics as string[] : [],
    savedAt: new Date(row.saved_at as string),
  };
}

function mapQueueItem(row: Record<string, unknown>): QueueItem {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    commentId: row.comment_id as string,
    commentBody: row.comment_body as string,
    commentUrl: row.comment_url as string,
    author: row.author as string,
    upvotes: row.upvotes as number,
    depth: row.depth as number,
    relevanceScore: row.relevance_score as number,
    reasoning: row.reasoning as string,
    replyAngle: (row.reply_angle as string) ?? null,
    urgency: row.urgency as QueueItem["urgency"],
    status: row.status as QueueItem["status"],
    parentChain: parseParentChain(row.parent_chain),
    savedAt: new Date(row.saved_at as string),
    repliedAt: row.replied_at ? new Date(row.replied_at as string) : null,
    notes: (row.notes as string) ?? null,
  };
}

function mapQueueItemWithThread(
  row: Record<string, unknown>
): QueueItemWithThread {
  return {
    ...mapQueueItem(row),
    thread: {
      id: row.t_id as string,
      postId: row.post_id as string,
      title: row.title as string,
      url: row.url as string,
      subreddit: row.subreddit as string,
      relevanceScore: row.t_relevance_score as number,
      reasoning: row.t_reasoning as string,
      suggestedTopics: Array.isArray(row.suggested_topics) ? row.suggested_topics as string[] : [],
      savedAt: new Date(row.t_saved_at as string),
    },
  };
}

function parseParentChain(value: unknown): RedditComment[] {
  if (Array.isArray(value)) return value as RedditComment[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as RedditComment[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapCrawlRun(row: Record<string, unknown>): CrawlRun {
  return {
    id: row.id as string,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at
      ? new Date(row.completed_at as string)
      : null,
    subreddits: row.subreddits as string[],
    threadsScanned: row.threads_scanned as number,
    threadsSaved: row.threads_saved as number,
    commentsSaved: row.comments_saved as number,
    errorMessage: (row.error_message as string) ?? null,
  };
}

function mapScoutConfig(row: Record<string, unknown>): ScoutConfigRow {
  return {
    subreddits: row.subreddits as string[],
    topicDescription: row.topic_description as string,
    replyPersona: row.reply_persona as string,
    threadThreshold: row.thread_threshold as number,
    commentThreshold: row.comment_threshold as number,
    rateLimitMs: row.rate_limit_ms as number,
    pollIntervalMs: row.poll_interval_ms as number,
    updatedAt: new Date(row.updated_at as string),
  };
}
