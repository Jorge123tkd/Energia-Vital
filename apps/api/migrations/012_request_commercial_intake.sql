-- Fase 1 de solicitudes Bonaire: datos comerciales DECLARADOS, no términos de contrato.
-- No obliga al cliente a tener presupuesto ni forma de pago definida.
CREATE TABLE IF NOT EXISTS request_intake (
  request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  available_budget_usd_cents INTEGER CHECK (available_budget_usd_cents BETWEEN 0 AND 99999999999),
  payment_method TEXT CHECK (payment_method IS NULL OR length(payment_method) BETWEEN 1 AND 160),
  payment_currency TEXT CHECK (payment_currency IS NULL OR length(payment_currency) BETWEEN 1 AND 30),
  customer_type TEXT CHECK (customer_type IS NULL OR customer_type IN
    ('persona','mipyme','estatal','tcp','cooperativa','empresa_privada','otro')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- La propuesta es una categoría comercial; el tipo legado sigue siendo consultation.
INSERT OR IGNORE INTO request_categories
 (id,name,legacy_type,requires_image,is_active,sort_order)
VALUES ('commercial-proposal','Propuesta comercial','consultation',0,1,20);
