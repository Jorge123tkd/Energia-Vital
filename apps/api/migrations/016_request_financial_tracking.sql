-- Bonaire fase 4A — seguimiento económico estrictamente PRIVADO, aditivo.
-- NUNCA convertir fondos o pagos declarados en fondos/pagos confirmados.
-- Importes expresados SIEMPRE en centavos USD de referencia, sin tipos de cambio.
CREATE TABLE IF NOT EXISTS request_financial_declarations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK(source IN ('customer_reported','terms_discussed')),
  funding_stage TEXT NOT NULL CHECK(funding_stage IN (
    'not_confirmed','approval_pending','approval_reported','availability_reported')),
  approved_funds_declared_cents INTEGER CHECK (
    approved_funds_declared_cents IS NULL OR
    approved_funds_declared_cents BETWEEN 0 AND 99999999999),
  available_funds_declared_cents INTEGER CHECK (
    available_funds_declared_cents IS NULL OR
    available_funds_declared_cents BETWEEN 0 AND 99999999999),
  advance_proposed_cents INTEGER CHECK (
    advance_proposed_cents IS NULL OR advance_proposed_cents BETWEEN 0 AND 99999999999),
  payment_method TEXT NOT NULL CHECK(payment_method IN (
    'transfer','cash','card','mixed','other','undecided')),
  payment_deadline TEXT CHECK(payment_deadline IS NULL OR payment_deadline
    GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  expected_payment_date TEXT CHECK(expected_payment_date IS NULL OR expected_payment_date
    GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  notes TEXT NOT NULL CHECK(length(trim(notes)) BETWEEN 3 AND 1500),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_declarations_request
  ON request_financial_declarations(request_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_finance_declaration_no_update
BEFORE UPDATE ON request_financial_declarations
BEGIN SELECT RAISE(ABORT,'Declaraciones financieras inmutables; crea un nuevo registro'); END;
CREATE TRIGGER IF NOT EXISTS trg_finance_declaration_no_delete
BEFORE DELETE ON request_financial_declarations
BEGIN SELECT RAISE(ABORT,'No se borra el historial de declaraciones financieras'); END;

-- "reported" significa solo que un cliente informó de un pago.
-- "verified_manual" registra la comprobación administrativa manual con fuente.
-- NO se conecta a bancos ni se considera conciliación automática/contable.
CREATE TABLE IF NOT EXISTS request_payment_reports (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  reported_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  amount_usd_cents INTEGER NOT NULL CHECK(amount_usd_cents BETWEEN 1 AND 99999999999),
  payment_method TEXT NOT NULL CHECK(payment_method IN (
    'transfer','cash','card','mixed','other')),
  reported_on TEXT NOT NULL CHECK(reported_on
    GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  reference TEXT COLLATE NOCASE CHECK(reference IS NULL OR
    length(trim(reference)) BETWEEN 4 AND 80),
  report_note TEXT NOT NULL CHECK(length(trim(report_note)) BETWEEN 3 AND 900),
  verification_status TEXT NOT NULL DEFAULT 'reported'
    CHECK(verification_status IN ('reported','verified_manual','rejected')),
  reviewed_by TEXT REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  verification_basis TEXT CHECK(verification_basis IS NULL OR verification_basis IN (
    'bank_statement','cash_count','provider_confirmation','other')),
  review_note TEXT CHECK(review_note IS NULL OR length(trim(review_note)) BETWEEN 3 AND 900),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_reports_request
  ON request_payment_reports(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_reports_pending
  ON request_payment_reports(verification_status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_reports_reference
  ON request_payment_reports(request_id,reference) WHERE reference IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_payment_report_immutable_fields
BEFORE UPDATE OF request_id,reported_by,amount_usd_cents,payment_method,
  reported_on,reference,report_note,created_at
ON request_payment_reports
BEGIN SELECT RAISE(ABORT,'No se reescribe un pago reportado; registra una correccion separada'); END;
CREATE TRIGGER IF NOT EXISTS trg_payment_report_no_delete
BEFORE DELETE ON request_payment_reports
BEGIN SELECT RAISE(ABORT,'No se eliminan reportes de pago'); END;
CREATE TRIGGER IF NOT EXISTS trg_payment_report_one_review
BEFORE UPDATE ON request_payment_reports
WHEN OLD.verification_status<>'reported'
 OR NEW.verification_status NOT IN ('verified_manual','rejected')
 OR NEW.reviewed_at IS NULL
 OR NOT EXISTS (
    SELECT 1 FROM admin_users a
    WHERE a.id=NEW.reviewed_by AND a.role='admin' AND a.is_active=1
 )
 OR (
    NEW.verification_status='verified_manual'
    AND (NEW.verification_basis IS NULL OR length(trim(COALESCE(NEW.review_note,'')))<15)
 )
 OR (NEW.verification_status='rejected'
    AND length(trim(COALESCE(NEW.review_note,'')))<3)
BEGIN
  SELECT RAISE(ABORT,'Solo admin activo valida o rechaza una vez y deja evidencia');
END;
