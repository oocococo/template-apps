CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  task_id TEXT,
  title TEXT,
  tag TEXT
);

CREATE INDEX IF NOT EXISTS study_sessions_recent
  ON study_sessions (workspace_id, started_at);

CREATE TABLE IF NOT EXISTS study_profile (
  workspace_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS island_buildings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  subject TEXT NOT NULL,
  building_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'built',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS island_buildings_workspace
  ON island_buildings (workspace_id, created_at);

CREATE TABLE IF NOT EXISTS island_unlocks (
  workspace_id TEXT NOT NULL,
  tree_type TEXT PRIMARY KEY,
  cost INTEGER NOT NULL,
  unlocked_at TEXT NOT NULL
);
