-- Bonaire fase 3A: versiones inmutables de cotizaciones INTERNAS.
-- Nunca crea ofertas públicas, facturas ni pagos verificados.
-- Exclusivamente aditiva: las tablas previas permanecen intactas.
CREATE TABLE IF NOT EXISTS commercial_quote_versions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL CHECK(version_no BETWEEN 1 AND 1000000),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 180),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  items_json TEXT NOT NULL CHECK(json_valid(items_json) AND json_type(items_json)='array'),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
  taxes_cents INTEGER NOT NULL DEFAULT 0 CHECK(taxes_cents>=0),
  freight_cents INTEGER NOT NULL DEFAULT 0 CHECK(freight_cents>=0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents>=0),
  total_cents INTEGER NOT NULL CHECK(total_cents>=0),
  valid_until TEXT CHECK(valid_until IS NULL OR valid_until
    GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  delivery_terms TEXT,
  warranty_terms TEXT,
  payment_terms TEXT,
  stock_notes TEXT,
  tax_notes TEXT,
  freight_notes TEXT,
  internal_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','in_review','approved_internal','rejected','superseded')),
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_reason TEXT,
  UNIQUE(request_id,version_no)
);
CREATE INDEX IF NOT EXISTS idx_quote_request_version
  ON commercial_quote_versions(request_id,version_no DESC);
CREATE INDEX IF NOT EXISTS idx_quote_status
  ON commercial_quote_versions(status,updated_at DESC);
-- Una sola versión editable/en revisión por solicitud; las anteriores se conservan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_one_open_version
  ON commercial_quote_versions(request_id)
  WHERE status IN ('draft','in_review');

-- No reescribir un presupuesto ya guardado: generar otra versión.
CREATE TRIGGER IF NOT EXISTS trg_quote_immutable_content
BEFORE UPDATE OF request_id,version_no,title,currency,items_json,
  subtotal_cents,taxes_cents,freight_cents,discount_cents,total_cents,
  valid_until,delivery_terms,warranty_terms,payment_terms,stock_notes,
  tax_notes,freight_notes,internal_notes,created_by,created_at
ON commercial_quote_versions
BEGIN
  SELECT RAISE(ABORT,'El contenido de una cotizacion es inmutable; crea una nueva version');
END;
CREATE TRIGGER IF NOT EXISTS trg_quote_no_delete
BEFORE DELETE ON commercial_quote_versions
BEGIN
  SELECT RAISE(ABORT,'No se elimina el historial de cotizaciones');
END;
CREATE TRIGGER IF NOT EXISTS trg_quote_status_transitions
BEFORE UPDATE OF status ON commercial_quote_versions
WHEN NOT (
  (OLD.status='draft' AND NEW.status IN ('in_review','superseded'))
  OR (OLD.status='in_review' AND NEW.status IN ('approved_internal','rejected'))
)
BEGIN
  SELECT RAISE(ABORT,'Transicion de revision de cotizacion no autorizada');
END;
-- Aprobación/rechazo requieren identidad de un administrador REAL activo;
-- no basta con que un operador introduzca una ID de aprobación.
CREATE TRIGGER IF NOT EXISTS trg_quote_admin_review
BEFORE UPDATE OF status ON commercial_quote_versions
WHEN NEW.status IN ('approved_internal','rejected')
AND (
  NOT EXISTS (SELECT 1 FROM admin_users a
    WHERE a.id=NEW.reviewed_by AND a.role='admin' AND a.is_active=1)
  OR NEW.reviewed_at IS NULL
  OR (NEW.status='rejected' AND length(trim(COALESCE(NEW.review_reason,'')))<3)
)
BEGIN
  SELECT RAISE(ABORT,'Revision requiere administrador activo y motivo al rechazar');
END;
CREATE TRIGGER IF NOT EXISTS trg_quote_no_change_review
BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason
ON commercial_quote_versions
WHEN OLD.status IN ('approved_internal','rejected')
BEGIN
  SELECT RAISE(ABORT,'La decision historica de revision no se modifica');
END;
