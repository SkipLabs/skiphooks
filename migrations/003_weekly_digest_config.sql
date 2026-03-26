CREATE TABLE weekly_digest_config (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  target_group_id TEXT NOT NULL,
  auth_token      TEXT NOT NULL REFERENCES auth_tokens(name),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_run_at     TIMESTAMPTZ
);
