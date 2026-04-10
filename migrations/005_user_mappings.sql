CREATE TABLE IF NOT EXISTS user_mappings (
  github_username    TEXT PRIMARY KEY,
  slashwork_username TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
