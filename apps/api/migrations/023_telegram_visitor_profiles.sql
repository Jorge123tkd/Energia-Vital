-- Public profile metadata only; no phone, password or conversation content.
CREATE TABLE IF NOT EXISTS telegram_visitor_profiles (
  chat_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  updated_at TEXT NOT NULL
);
