CREATE TABLE auth_tokens (
  name  TEXT PRIMARY KEY,
  token TEXT NOT NULL
);

CREATE TABLE groups (
  name         TEXT PRIMARY KEY,
  slashwork_id TEXT NOT NULL,
  auth_token   TEXT NOT NULL REFERENCES auth_tokens(name)
);

CREATE TABLE routes (
  name       TEXT PRIMARY KEY,
  group_name TEXT REFERENCES groups(name),
  stream_id  TEXT,
  auth_token TEXT REFERENCES auth_tokens(name),
  CONSTRAINT route_type CHECK (
    (group_name IS NOT NULL AND stream_id IS NULL AND auth_token IS NULL)
    OR (group_name IS NULL AND stream_id IS NOT NULL AND auth_token IS NOT NULL)
  )
);
