-- Temporary, separate customer registration drafts and website-generated linking codes.
-- No historical accounts or verified links are modified.
CREATE TABLE IF NOT EXISTS telegram_customer_registration_drafts (
  chat_id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  stage TEXT NOT NULL CHECK(stage IN ('name','phone','email','address','city','province','password')),
  data_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  last_update_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_registration_expiry ON telegram_customer_registration_drafts(expires_at);
CREATE TABLE IF NOT EXISTS telegram_customer_link_codes (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_customer_link_expiry ON telegram_customer_link_codes(expires_at);
