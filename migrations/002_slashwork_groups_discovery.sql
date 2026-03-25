CREATE TABLE slashwork_groups (
  slashwork_id TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
