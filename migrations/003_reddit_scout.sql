CREATE TABLE saved_threads (
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

CREATE TABLE queue_items (
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

CREATE TABLE crawl_runs (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  subreddits       TEXT[] NOT NULL,
  threads_scanned  INTEGER NOT NULL DEFAULT 0,
  threads_saved    INTEGER NOT NULL DEFAULT 0,
  comments_saved   INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT
);

CREATE INDEX idx_queue_items_status ON queue_items(status);
CREATE INDEX idx_queue_items_urgency ON queue_items(urgency);
CREATE INDEX idx_queue_items_saved_at ON queue_items(saved_at DESC);
CREATE INDEX idx_saved_threads_post_id ON saved_threads(post_id);
