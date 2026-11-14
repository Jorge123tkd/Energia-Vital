-- Aplicar después de 001_init.sql y 002_complete_system.sql.
-- No elimina datos existentes. Clientes antiguos deberán completar el perfil.
ALTER TABLE customers ADD COLUMN province TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique
  ON customers(LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('customer', 'admin')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, user_type);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(expires_at, revoked_at);
