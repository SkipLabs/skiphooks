CREATE TABLE calendar_users (
  name        TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  target_id   TEXT NOT NULL
);
