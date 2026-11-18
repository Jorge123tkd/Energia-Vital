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
