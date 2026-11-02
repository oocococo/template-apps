CREATE TABLE IF NOT EXISTS nes_games (
  app_id TEXT,
  rom_hash TEXT,
  title TEXT,
  file_path TEXT,
  size_bytes INTEGER,
  added_at TEXT,
  pinned INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  PRIMARY KEY (app_id, rom_hash)
);
CREATE INDEX IF NOT EXISTS nes_games_library ON nes_games(app_id, pinned DESC, use_count DESC, added_at DESC, rom_hash DESC);
CREATE TABLE IF NOT EXISTS nes_save_slots (
  app_id TEXT,
  rom_hash TEXT,
  slot INTEGER,
  state TEXT,
  screenshot TEXT,
  saved_at TEXT,
  PRIMARY KEY (app_id, rom_hash, slot)
);
