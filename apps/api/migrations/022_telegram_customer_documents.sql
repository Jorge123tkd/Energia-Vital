-- A new verified identity; deliberately do not copy legacy telegram_chat_id.
ALTER TABLE customers ADD COLUMN telegram_customer_chat_id TEXT;
CREATE UNIQUE INDEX idx_customers_verified_telegram ON customers(telegram_customer_chat_id)
  WHERE telegram_customer_chat_id IS NOT NULL;
-- Documents are separate from galleries and images, with explicit ownership.
CREATE TABLE request_documents (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
  direction TEXT NOT NULL CHECK(direction IN ('customer','staff')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_request_documents_case ON request_documents(request_id,created_at);
CREATE INDEX idx_request_documents_customer ON request_documents(customer_id);

-- Explicit opt-in starts from the moment of consent, not historical notifications.
ALTER TABLE customers ADD COLUMN telegram_notifications_since TEXT;
CREATE TABLE telegram_customer_notice_deliveries (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','sent','failed','cancelled')),
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_telegram_notice_customer ON telegram_customer_notice_deliveries(customer_id);
CREATE INDEX idx_customer_notice_pending ON notifications(user_type,user_id,is_read,created_at);

-- Bound Telegram file-processing load per private chat.
CREATE TABLE telegram_attachment_quota (
  chat_id TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 12)
);
