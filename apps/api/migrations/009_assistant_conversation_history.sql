-- Bonaire: nombres editables e índice para historial de conversaciones del asistente.
-- Conserva conversaciones y mensajes previos.
ALTER TABLE assistant_sessions ADD COLUMN title TEXT;
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_customer_history
  ON assistant_sessions(customer_id, channel, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_session_order
  ON assistant_messages(session_id, created_at ASC);
