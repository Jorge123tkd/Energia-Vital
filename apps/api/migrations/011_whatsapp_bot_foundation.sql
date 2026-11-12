-- Bonaire: WhatsApp Cloud API, conversaciones mínimas y vinculación voluntaria del personal.
-- No crea ni vincula cuentas de clientes automáticamente.
-- Aplicar únicamente después de validar código y preparar la configuración de Meta.
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  wa_id TEXT PRIMARY KEY,
  solar_context TEXT NOT NULL DEFAULT '{}',
  window_start TEXT,
  window_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS whatsapp_events (
  message_id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','sent','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_sender ON whatsapp_events(wa_id,created_at);

CREATE TABLE IF NOT EXISTS whatsapp_staff_links (
  wa_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL UNIQUE REFERENCES admin_users(id) ON DELETE CASCADE,
  verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS whatsapp_staff_link_codes (
  code_hash TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_staff_codes_user ON whatsapp_staff_link_codes(admin_user_id);
CREATE TABLE IF NOT EXISTS whatsapp_link_attempts (
  wa_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
