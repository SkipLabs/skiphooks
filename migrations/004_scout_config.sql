CREATE TABLE IF NOT EXISTS scout_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  subreddits TEXT[] NOT NULL,
  topic_description TEXT NOT NULL,
  reply_persona TEXT NOT NULL,
  thread_threshold REAL NOT NULL DEFAULT 0.5,
  comment_threshold REAL NOT NULL DEFAULT 0.6,
  rate_limit_ms INTEGER NOT NULL DEFAULT 1000,
  poll_interval_ms INTEGER NOT NULL DEFAULT 60000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
