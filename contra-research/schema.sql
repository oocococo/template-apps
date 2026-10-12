CREATE TABLE IF NOT EXISTS save_slots (
  rom_hash TEXT,
  slot INTEGER,
  state TEXT,
  screenshot TEXT,
  saved_at TEXT,
  PRIMARY KEY (rom_hash, slot)
);
