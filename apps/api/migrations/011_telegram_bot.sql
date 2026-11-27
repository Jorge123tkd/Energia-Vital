-- Bonaire Telegram Bot API: cuentas independientes del portal, permisos de personal verificados.
-- Migracion 011 (la antigua WhatsApp 011 NO se aplico; movida a docs/archived-migrations).
-- No guarda el token de Telegram ni revela cuentas privadas de clientes.
CREATE TABLE IF NOT EXISTS telegram_bot_sessions (
  chat_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  solar_context TEXT NOT NULL DEFAULT 'null',
  window_start TEXT,
  window_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_bot_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(chat_id) REFERENCES telegram_bot_sessions(chat_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_messages_thread
  ON telegram_bot_messages(chat_id,thread_id,created_at);

CREATE TABLE IF NOT EXISTS telegram_bot_updates (
  update_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','sent','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_updates_chat
  ON telegram_bot_updates(chat_id,created_at);

CREATE TABLE IF NOT EXISTS telegram_staff_links (
  chat_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
  verified_at TEXT NOT NULL,
  reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reminders_enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS telegram_staff_link_codes (
  code_hash TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_staff_link_attempts (
  chat_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_staff_digest_log (
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  cuba_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','sent','failed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(admin_user_id,cuba_date)
);
