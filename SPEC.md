# Reddit Scout — SPEC.md

> Source of truth for all Claude Code prompts.  
> Every prompt should reference this file. Do not deviate from interfaces defined here without updating this spec first.

---

## Project Overview

Reddit Scout is a background agent that monitors Reddit for conversations relevant to SkipLabs / Skipper / DocHudson. It operates at two levels:

1. **Thread level** — is this conversation worth diving into?
2. **Comment level** — within a relevant thread, is there a specific message worth responding to?

The output is an actionable queue of reply opportunities displayed in a web dashboard after login.

**Stack:** Next.js 14 (App Router) · TypeScript · Bun (runtime + package manager + test runner) · Clerk (auth, already configured) · postgres.js + PostgreSQL (raw SQL, no ORM) · Claude API (anthropic SDK) · native fetch Reddit client (no snoowrap — CJS incompatible with Bun)

**Not in scope (yet):** Slack/Slashwork notifications, paid Reddit API.

---

## Directory Structure

```
/
├── SPEC.md
├── sql/
│   └── schema.sql                   ← plain SQL schema, run once to initialize DB
├── src/
│   ├── types/                       ← all shared interfaces, no implementation
│   │   ├── reddit.ts
│   │   ├── scoring.ts
│   │   └── storage.ts
│   ├── lib/
│   │   ├── config.ts                ← env vars, rate limits, topic config
│   │   ├── reddit/
│   │   │   ├── client.ts            ← Reddit API client (OAuth2 + fetch)
│   │   │   ├── crawler.ts           ← poll new posts from subreddits
│   │   │   └── fetcher.ts           ← fetch comment trees for a thread
│   │   ├── scoring/
│   │   │   ├── client.ts            ← Anthropic client singleton
│   │   │   ├── thread.ts            ← level-1 thread relevance scoring
│   │   │   └── comment.ts           ← level-2 comment response-worthiness scoring
│   │   ├── db/
│   │   │   ├── client.ts            ← postgres.js client singleton
│   │   │   └── repository.ts        ← all DB read/write, raw SQL
│   │   └── pipeline/
│   │       └── runner.ts            ← orchestrates crawler → scorer → storage
│   └── app/
│       ├── api/
│       │   ├── pipeline/
│       │   │   └── run/
│       │   │       └── route.ts     ← POST /api/pipeline/run
│       │   └── queue/
│       │       ├── route.ts         ← GET /api/queue
│       │       └── [id]/
│       │           └── route.ts     ← PATCH /api/queue/[id] (status, notes)
│       └── dashboard/
│           ├── layout.tsx
│           ├── page.tsx
│           └── components/
│               ├── QueueList.tsx
│               ├── ThreadCard.tsx
│               ├── CommentCard.tsx
│               └── FilterBar.tsx
└── tests/
    └── lib/
        ├── scoring/
        │   ├── thread.test.ts
        │   └── comment.test.ts
        └── pipeline/
            └── runner.test.ts
```

---

## Database Schema (`/sql/schema.sql`)

Plain SQL. Run once: `psql $DATABASE_URL -f sql/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS saved_threads (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id          TEXT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  url              TEXT NOT NULL,
  subreddit        TEXT NOT NULL,
  relevance_score  REAL NOT NULL,
  reasoning        TEXT NOT NULL,
  suggested_topics TEXT[] NOT NULL DEFAULT '{}',
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_items (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id       TEXT NOT NULL REFERENCES saved_threads(id),
  comment_id      TEXT UNIQUE NOT NULL,
  comment_body    TEXT NOT NULL,
  comment_url     TEXT NOT NULL,
  author          TEXT NOT NULL,
  upvotes         INTEGER NOT NULL,
  depth           INTEGER NOT NULL,
  relevance_score REAL NOT NULL,
  reasoning       TEXT NOT NULL,
  reply_angle     TEXT,
  urgency         TEXT NOT NULL CHECK (urgency IN ('high', 'medium', 'low')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'replied', 'dismissed', 'snoozed')),
  parent_chain    JSONB NOT NULL DEFAULT '[]',
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replied_at      TIMESTAMPTZ,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  subreddits       TEXT[] NOT NULL,
  threads_scanned  INTEGER NOT NULL DEFAULT 0,
  threads_saved    INTEGER NOT NULL DEFAULT 0,
  comments_saved   INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_items_status ON queue_items(status);
CREATE INDEX IF NOT EXISTS idx_queue_items_urgency ON queue_items(urgency);
CREATE INDEX IF NOT EXISTS idx_queue_items_saved_at ON queue_items(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_threads_post_id ON saved_threads(post_id);
```

---

## Types (`/src/types/`)

### `reddit.ts`

```typescript
export interface RedditPost {
  id: string;
  title: string;
  url: string;                  // full permalink: https://reddit.com/r/.../
  subreddit: string;
  upvotes: number;
  numComments: number;
  selftext: string;             // body text, max 2000 chars stored
  author: string;
  createdUtc: number;           // unix timestamp
}

export interface RedditComment {
  id: string;
  postId: string;
  parentId: string;             // direct parent (post id or comment id)
  body: string;                 // max 1000 chars stored
  author: string;
  upvotes: number;
  depth: number;                // 0 = top-level comment
  createdUtc: number;
  parentChain: RedditComment[]; // ancestors from root to this comment
}

export interface CommentTree {
  post: RedditPost;
  comments: RedditComment[];    // flattened, depth-first order
}
```

### `scoring.ts`

```typescript
export type ThreadVerdict = "dive_in" | "skip";
export type CommentVerdict = "reply_worthy" | "interesting" | "skip";

export interface ThreadScore {
  postId: string;
  verdict: ThreadVerdict;
  relevanceScore: number;       // 0.0 – 1.0
  reasoning: string;            // 1-2 sentences
  suggestedTopics: string[];
}

export interface CommentScore {
  commentId: string;
  postId: string;
  verdict: CommentVerdict;
  relevanceScore: number;       // 0.0 – 1.0
  reasoning: string;
  replyAngle: string | null;    // if reply_worthy: 1-sentence suggested angle
  urgency: "high" | "medium" | "low";
}

export interface ScoringConfig {
  topicDescription: string;
  replyPersona: string;
  threadThreshold: number;      // min score to dive into thread, e.g. 0.5
  commentThreshold: number;     // min score to flag a comment, e.g. 0.6
}
```

### `storage.ts`

```typescript
import type { RedditComment } from "./reddit";

export type QueueItemStatus = "pending" | "replied" | "dismissed" | "snoozed";
export type Urgency = "high" | "medium" | "low";

export interface SavedThread {
  id: string;
  postId: string;
  title: string;
  url: string;
  subreddit: string;
  relevanceScore: number;
  reasoning: string;
  suggestedTopics: string[];
  savedAt: Date;
}

export interface QueueItem {
  id: string;
  threadId: string;
  commentId: string;
  commentBody: string;
  commentUrl: string;
  author: string;
  upvotes: number;
  depth: number;
  relevanceScore: number;
  reasoning: string;
  replyAngle: string | null;
  urgency: Urgency;
  status: QueueItemStatus;
  parentChain: RedditComment[];  // stored as JSONB
  savedAt: Date;
  repliedAt: Date | null;
  notes: string | null;
}

// QueueItem joined with its parent SavedThread — used by API and UI
export interface QueueItemWithThread extends QueueItem {
  thread: SavedThread;
}

export interface QueueFilter {
  status?: QueueItemStatus;
  urgency?: Urgency;
  subreddit?: string;
  minScore?: number;
}

export interface CrawlRun {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  subreddits: string[];
  threadsScanned: number;
  threadsSaved: number;
  commentsSaved: number;
  errorMessage: string | null;
}
```

---

## Module Contracts

### `lib/config.ts`

Reads from `process.env`. Throws at startup if required vars are missing. Exports a single frozen `config` object.

```typescript
import type { ScoringConfig } from "@/types/scoring";

export const config: {
  reddit: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
    rateLimitMs: number;          // ms between requests, default 1000
  };
  anthropic: {
    apiKey: string;
    model: string;                // "claude-sonnet-4-5"
  };
  scoring: ScoringConfig;
  db: {
    url: string;
  };
  pipeline: {
    subreddits: string[];         // from SCOUT_SUBREDDITS (comma-separated)
    batchSize: number;            // posts to collect before scoring, default 20
    maxCommentsPerThread: number; // default 100
    pollIntervalMs: number;       // wait between subreddit polls, default 60000
  };
}
```

---

### `lib/reddit/client.ts`

Thin wrapper around Reddit's JSON API using native `fetch`. No third-party Reddit SDK — snoowrap is CommonJS and incompatible with Bun.

Authentication: Reddit script-type app credentials exchanged for an access token via OAuth2 client-credentials flow. Token cached in module scope and refreshed when expired.

```typescript
// Returns a valid Bearer token, refreshing if needed
export async function getAccessToken(): Promise<string>

// Core fetch helper — sets Authorization + User-Agent headers,
// respects config.reddit.rateLimitMs, throws on non-2xx
export async function redditFetch<T>(path: string): Promise<T>
```

Token endpoint: `POST https://www.reddit.com/api/v1/access_token`  
Base API URL: `https://oauth.reddit.com`

---

### `lib/reddit/crawler.ts`

Polls new posts using `GET /r/{subreddit}/new.json`. Does **not** score.

```typescript
import type { RedditPost } from "@/types/reddit";

// Fetches up to `limit` new posts from each subreddit.
// Waits config.reddit.rateLimitMs between each subreddit fetch.
// Maps Reddit API response fields to RedditPost interface.
export async function fetchNewPosts(
  subreddits: string[],
  limit?: number              // default: config.pipeline.batchSize
): Promise<RedditPost[]>
```

Reddit API response mapping:
- `data.children[].data.id` → `id`
- `data.children[].data.title` → `title`
- `data.children[].data.permalink` → `url` (prefix with `https://reddit.com`)
- `data.children[].data.subreddit` → `subreddit`
- `data.children[].data.score` → `upvotes`
- `data.children[].data.num_comments` → `numComments`
- `data.children[].data.selftext` → `selftext` (truncate to 2000 chars)
- `data.children[].data.author` → `author`
- `data.children[].data.created_utc` → `createdUtc`

---

### `lib/reddit/fetcher.ts`

Uses `GET /r/{subreddit}/comments/{postId}.json?limit=500&depth=10` via `redditFetch`.

```typescript
import type { CommentTree } from "@/types/reddit";

// Fetches the full comment tree for a post via Reddit JSON API.
// Flattens depth-first and populates parentChain for each comment.
// Caps at config.pipeline.maxCommentsPerThread.
// Reddit response is a 2-element array: [postListing, commentListing]
export async function fetchCommentTree(
  postId: string,
  subreddit: string
): Promise<CommentTree>
```

Reddit comment response mapping:
- `body` → `body` (truncate to 1000 chars, skip `[deleted]` and `[removed]`)
- `author` → `author`
- `score` → `upvotes`
- `id` → `id`
- `parent_id` → `parentId` (strip `t1_` / `t3_` prefix)
- `created_utc` → `createdUtc`
- depth tracked by recursive traversal of `replies.data.children`

---

### `lib/scoring/client.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicClient(): Anthropic
```

---

### `lib/scoring/thread.ts`

```typescript
import type { RedditPost } from "@/types/reddit";
import type { ThreadScore, ScoringConfig } from "@/types/scoring";

// Single Claude API call for up to 20 posts.
// Returns scores in same order as input.
// Missing/failed entries get verdict "skip", relevanceScore 0.
export async function scoreThreadBatch(
  posts: RedditPost[],
  config: ScoringConfig
): Promise<ThreadScore[]>
```

**Prompt design:**
- System prompt: SkipLabs identity + what "relevant" means for our use case
- User message: JSON array of `{ postId, title, selftext (500 chars max), upvotes, numComments }`
- Expected Claude response: JSON array of `{ postId, verdict, relevanceScore, reasoning, suggestedTopics }`
- Max 20 posts per call

---

### `lib/scoring/comment.ts`

```typescript
import type { CommentTree } from "@/types/reddit";
import type { CommentScore, ScoringConfig } from "@/types/scoring";

// Returns only comments above config.commentThreshold.
// Processes in batches of 30 comments per Claude call.
export async function scoreComments(
  tree: CommentTree,
  config: ScoringConfig
): Promise<CommentScore[]>
```

**Prompt design:**
- System prompt: SkipLabs identity + thread title + thread selftext for context
- Per comment: `{ commentId, body (500 chars max), depth, upvotes, parentChainSummary }`
- Expected Claude response: `{ commentId, verdict, relevanceScore, reasoning, replyAngle, urgency }`
- `replyAngle`: one sentence, only when `verdict === "reply_worthy"`
- Only return entries where `verdict !== "skip"`

---

### `lib/db/client.ts`

```typescript
import postgres from "postgres";

// Singleton postgres.js client using config.db.url
export function getDb(): postgres.Sql
```

---

### `lib/db/repository.ts`

Raw SQL via postgres.js tagged template literals. No business logic.

```typescript
import type {
  SavedThread, QueueItem, QueueItemWithThread,
  QueueFilter, CrawlRun, QueueItemStatus
} from "@/types/storage";

// Threads
export async function saveThread(
  thread: Omit<SavedThread, "id" | "savedAt">
): Promise<SavedThread>

export async function threadExists(postId: string): Promise<boolean>

// Queue items
export async function saveQueueItem(
  item: Omit<QueueItem, "id" | "savedAt" | "status" | "repliedAt" | "notes">
): Promise<QueueItem>

export async function getQueue(filter?: QueueFilter): Promise<QueueItemWithThread[]>

export async function updateQueueItemStatus(
  id: string,
  status: QueueItemStatus
): Promise<QueueItem>

export async function updateQueueItemNotes(
  id: string,
  notes: string
): Promise<QueueItem>

// Crawl runs
export async function createCrawlRun(subreddits: string[]): Promise<CrawlRun>

export async function completeCrawlRun(
  id: string,
  stats: {
    threadsScanned: number;
    threadsSaved: number;
    commentsSaved: number;
    errorMessage?: string;
  }
): Promise<CrawlRun>
```

**SQL notes:**
- `getQueue` JOINs `saved_threads` → returns `QueueItemWithThread[]`
- All WHERE clauses built with tagged template literals, never string concatenation
- `parent_chain` is JSONB — parse to `RedditComment[]` on read, serialize on write
- Column names in DB are snake_case; map to camelCase in TypeScript

---

### `lib/pipeline/runner.ts`

Orchestrates the full pipeline. Only module that imports from all others.

```typescript
export interface RunOptions {
  subreddits?: string[];    // override config.pipeline.subreddits
  maxPosts?: number;        // stop after N posts (useful for testing)
  dryRun?: boolean;         // score but do not write to DB
}

export interface RunResult {
  threadsScanned: number;
  threadsSaved: number;
  commentsSaved: number;
  durationMs: number;
}

export async function runPipeline(options?: RunOptions): Promise<RunResult>
```

**Flow:**
1. `createCrawlRun(subreddits)`
2. `fetchNewPosts(subreddits, limit)`
3. `scoreThreadBatch(posts, scoringConfig)` → keep only `verdict === "dive_in"` and score ≥ threshold
4. For each passing thread:
   a. `threadExists(postId)` → skip if true
   b. `fetchCommentTree(postId, post.subreddit)`
   c. `scoreComments(tree, scoringConfig)` → already filtered by threshold
   d. If not `dryRun`: `saveThread(...)` then for each scored comment:
      - Match the `CommentScore.commentId` back to its `RedditComment` in the `CommentTree`
      - Construct `commentUrl` as `https://reddit.com/r/{subreddit}/comments/{postId}/_/{commentId}` (derived, not from Reddit API)
      - Merge fields from both `CommentScore` (relevanceScore, reasoning, replyAngle, urgency) and `RedditComment` (body, author, upvotes, depth, parentChain) to build the full `saveQueueItem` input
5. `completeCrawlRun(id, stats)`
6. Return `RunResult`

---

### `app/api/pipeline/run/route.ts`

```typescript
// POST /api/pipeline/run
// Auth: Clerk auth() — return 401 if not signed in
// Body (optional, JSON): RunOptions
// Response (JSON): RunResult
// Safe to call from Vercel cron or external scheduler
```

---

### `app/api/queue/route.ts`

```typescript
// GET /api/queue
// Auth: Clerk auth() — return 401 if not signed in
// Query params (all optional): status, urgency, subreddit, minScore
// Response (JSON): QueueItemWithThread[]
```

### `app/api/queue/[id]/route.ts`

```typescript
// PATCH /api/queue/[id]
// Auth: Clerk auth() — return 401 if not signed in
// Body (JSON): { status?: QueueItemStatus, notes?: string }
// Response (JSON): QueueItem
```

---

### `app/dashboard/page.tsx`

Server component. Requires Clerk auth — redirect to sign-in if unauthenticated.  
Reads filter params from URL search params server-side, fetches initial queue, passes to `QueueList`.

**UI requirements:**

`FilterBar` (client component)
- Dropdowns: Status · Urgency · Subreddit
- Sort toggle: urgency desc (default) · score desc · date desc
- Updates URL search params on change — no full page reload

`QueueList` (client component)
- Groups `QueueItemWithThread[]` by thread
- Renders a `ThreadCard` per thread, with its `CommentCard`s nested inside
- Empty state when queue is empty or all filtered out
- Skeleton loading state

`ThreadCard`
- Thread title as a link (opens Reddit in new tab)
- Subreddit badge · relevance score bar · suggested topics as small tags
- Collapse/expand its comment cards

`CommentCard`
- Comment body excerpt (first 200 chars, expandable)
- Author · upvote count · depth indicator · urgency badge
- Reply angle (highlighted, if present)
- Actions row: **Mark replied** · **Dismiss** · **Snooze** · **Add note**
- "Add note" reveals an inline textarea; saves on blur via PATCH
- All status actions call `PATCH /api/queue/[id]` and update local state optimistically

---

## Environment Variables

```bash
# Reddit (free tier — script-type app, read-only)
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT="reddit-scout/1.0 by u/yourusername"

# Anthropic
ANTHROPIC_API_KEY=

# Database (PostgreSQL — Neon, Supabase, or self-hosted)
DATABASE_URL=

# Pipeline
SCOUT_SUBREDDITS="programming,MachineLearning,LocalLLaMA,webdev,typescript,artificial"
SCOUT_TOPIC_DESCRIPTION="Developers frustrated with AI-generated code that breaks when requirements change. People asking how to maintain, iterate on, or debug LLM-generated codebases. Skepticism about AI coding tools lacking context or memory of intent."
SCOUT_REPLY_PERSONA="We're building Skipper by SkipLabs — an AI-powered API platform designed for the day-two problem of AI-generated code. We help developers maintain and evolve AI-generated code over time without losing the original intent."
SCOUT_THREAD_THRESHOLD=0.5
SCOUT_COMMENT_THRESHOLD=0.6
SCOUT_RATE_LIMIT_MS=1000
SCOUT_POLL_INTERVAL_MS=60000

# Clerk (already configured)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

---

## Claude Code Prompt Sequence

One terminal per prompt. Each prompt must start with: `"Read SPEC.md first."`

```
Prompt 1 — Scaffold
Read SPEC.md. Create the full directory structure with empty files.
Define all TypeScript interfaces in /src/types/ exactly as specified.
Each lib module exports its functions with correct signatures but throws
new Error('not implemented'). Must pass: bun tsc --noEmit
Do not touch any other files.

Prompt 2 — DB schema + client
Read SPEC.md. Create sql/schema.sql exactly as specified.
Create src/lib/db/client.ts exporting getDb() as a postgres.js singleton.
Install with: bun add postgres
Do not run the migration. Do not touch any other files.

Prompt 3 — Config
Read SPEC.md. Implement src/lib/config.ts.
Throw a descriptive error at startup for each missing required env var.
Do not touch any other files.

Prompt 4 — Reddit client + crawler
Read SPEC.md. Implement src/lib/reddit/client.ts and src/lib/reddit/crawler.ts.
Use native fetch only — no snoowrap or any Reddit SDK (CJS incompatible with Bun).
client.ts handles OAuth2 token exchange and caching.
crawler.ts calls GET /r/{subreddit}/new.json. Wait rateLimitMs between subreddit fetches.
Do not touch any other files.

Prompt 5 — Reddit fetcher
Read SPEC.md. Implement src/lib/reddit/fetcher.ts.
Use redditFetch from client.ts. Reddit response is a 2-element array.
Flatten comments depth-first. Populate parentChain for each comment.
Skip comments with body [deleted] or [removed].
Cap at config.pipeline.maxCommentsPerThread.
Do not touch any other files.

Prompt 6 — Thread scorer
Read SPEC.md. Implement src/lib/scoring/thread.ts.
One Claude call per batch of 20 posts. Handle partial responses gracefully.
Write tests in tests/lib/scoring/thread.test.ts with mocked Anthropic client.
Run with: bun test tests/lib/scoring/thread.test.ts
Do not touch any other files.

Prompt 7 — Comment scorer
Read SPEC.md. Implement src/lib/scoring/comment.ts.
Include thread title + selftext in system prompt. Batch 30 comments per call.
replyAngle required when verdict is reply_worthy.
Write tests in tests/lib/scoring/comment.test.ts with mocked Anthropic client.
Run with: bun test tests/lib/scoring/comment.test.ts
Do not touch any other files.

Prompt 8 — Repository
Read SPEC.md. Implement src/lib/db/repository.ts.
All SQL via postgres.js tagged template literals — no string concatenation.
getQueue JOINs saved_threads. Parse parent_chain JSONB to RedditComment[].
Map snake_case DB columns to camelCase TypeScript fields.
Do not touch any other files.

Prompt 9 — Pipeline runner
Read SPEC.md. Implement src/lib/pipeline/runner.ts.
Follow the exact flow in SPEC.md. dryRun skips all DB writes.
Write tests in tests/lib/pipeline/runner.test.ts with all deps mocked.
Run with: bun test tests/lib/pipeline/runner.test.ts
Do not touch any other files.

Prompt 10 — API routes
Read SPEC.md. Implement the three API routes:
  src/app/api/pipeline/run/route.ts
  src/app/api/queue/route.ts
  src/app/api/queue/[id]/route.ts
All protected with Clerk auth() from @clerk/nextjs/server. Return 401 if not signed in.
Do not touch any other files.

Prompt 11 — Dashboard UI
Read SPEC.md. Implement src/app/dashboard/page.tsx and all components
in src/app/dashboard/components/ per the UI requirements in SPEC.md.
Server component fetches initial data. QueueList is a client component.
FilterBar updates URL search params. Status actions call PATCH /api/queue/[id]
with optimistic updates. Use Tailwind.
Do not touch any other files.
```

---

## Definition of Done

- [ ] `bun tsc --noEmit` passes with zero errors
- [ ] `bun test` passes
- [ ] `psql $DATABASE_URL -f sql/schema.sql` runs cleanly
- [ ] `runPipeline({ dryRun: true, maxPosts: 10 })` completes without errors
- [ ] `/dashboard` redirects to Clerk sign-in when unauthenticated
- [ ] `/dashboard` shows queue after login
- [ ] Status/notes updates persist after page refresh
- [ ] `CrawlRun` records are created and completed for each pipeline run