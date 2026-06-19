CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('free', 'guided')),
  seeded_prompt TEXT,
  guiding_prompts_json TEXT,
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('idle', 'running', 'done', 'error')),
  analysis_error TEXT,
  analysis_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT
);
