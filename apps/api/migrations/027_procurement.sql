-- Additive purchasing module. No balances or supplier records are seeded.
CREATE TABLE procurement_suppliers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 country TEXT NOT NULL CHECK(length(trim(country)) BETWEEN 1 AND 100),
 contact TEXT CHECK(contact IS NULL OR length(contact)<=300),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE procurement_orders (
 id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES procurement_suppliers(id),
 project_id TEXT REFERENCES warehouse_project_links(project_id),
 currency TEXT NOT NULL CHECK(currency IN ('USD','CUP','EUR','CNY')),
 incoterm TEXT NOT NULL CHECK(incoterm IN ('EXW','FCA','FOB','CFR','CIF','DAP','DDP','LOCAL')),
 reference TEXT NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','closed','cancelled')),
 created_by TEXT NOT NULL REFERENCES admin_users(id),
 approved_by TEXT REFERENCES admin_users(id),
 approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE procurement_lines (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES procurement_orders(id),
 item_id TEXT NOT NULL REFERENCES warehouse_items(id),
 quantity_milli INTEGER NOT NULL CHECK(typeof(quantity_milli)='integer' AND quantity_milli BETWEEN 1 AND 1000000000),
 -- Contracted line total in minor currency units; no floating-point money.
 total_minor INTEGER NOT NULL CHECK(typeof(total_minor)='integer' AND total_minor BETWEEN 0 AND 1000000000000),
 UNIQUE(order_id,item_id)
);
CREATE TRIGGER procurement_supplier_admin BEFORE INSERT ON procurement_suppliers
WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.created_by AND role='admin' AND is_active=1)
BEGIN SELECT RAISE(ABORT,'procurement_actor_not_authorized'); END;
CREATE TRIGGER procurement_order_create BEFORE INSERT ON procurement_orders BEGIN
 SELECT CASE WHEN NEW.status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.created_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM procurement_suppliers WHERE id=NEW.supplier_id AND active=1)
 THEN RAISE(ABORT,'procurement_order_not_authorized') END;
END;
CREATE TRIGGER procurement_line_insert BEFORE INSERT ON procurement_lines BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM procurement_orders WHERE id=NEW.order_id AND status='draft')
 THEN RAISE(ABORT,'procurement_order_locked') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM warehouse_items WHERE id=NEW.item_id AND unit IN ('unit','set','roll','box') AND NEW.quantity_milli%1000<>0)
 THEN RAISE(ABORT,'procurement_whole_unit_required') END;
END;
CREATE TRIGGER procurement_line_update BEFORE UPDATE ON procurement_lines
BEGIN SELECT RAISE(ABORT,'procurement_replace_draft_line'); END;
CREATE TRIGGER procurement_line_delete BEFORE DELETE ON procurement_lines
WHEN NOT EXISTS(SELECT 1 FROM procurement_orders WHERE id=OLD.order_id AND status='draft')
BEGIN SELECT RAISE(ABORT,'procurement_order_locked'); END;
ALTER TABLE warehouse_movements ADD COLUMN purchase_line_id TEXT REFERENCES procurement_lines(id) ON DELETE RESTRICT;
CREATE INDEX procurement_receipt_line ON warehouse_movements(purchase_line_id);
CREATE VIEW procurement_line_balances AS
SELECT l.id,l.order_id,l.item_id,l.quantity_milli,l.total_minor,
 COALESCE(SUM(m.quantity_milli),0) AS received_milli,
 l.quantity_milli-COALESCE(SUM(m.quantity_milli),0) AS outstanding_milli
FROM procurement_lines l LEFT JOIN warehouse_movements m ON m.purchase_line_id=l.id GROUP BY l.id;
CREATE TRIGGER procurement_receive_guard BEFORE INSERT ON warehouse_movements
WHEN NEW.purchase_line_id IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.kind<>'receive' OR NEW.project_id IS NOT NULL OR NEW.work_id IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM procurement_lines l JOIN procurement_orders o ON o.id=l.order_id
 WHERE l.id=NEW.purchase_line_id AND l.item_id=NEW.item_id AND o.status='ordered')
 THEN RAISE(ABORT,'procurement_receipt_invalid') END;
 SELECT CASE WHEN NEW.quantity_milli>COALESCE((SELECT outstanding_milli FROM procurement_line_balances WHERE id=NEW.purchase_line_id),0)
 THEN RAISE(ABORT,'procurement_over_receipt') END;
END;
CREATE TRIGGER procurement_order_transition BEFORE UPDATE ON procurement_orders BEGIN
 SELECT CASE WHEN NEW.id<>OLD.id OR NEW.supplier_id<>OLD.supplier_id OR NEW.project_id IS NOT OLD.project_id
 OR NEW.currency<>OLD.currency OR NEW.incoterm<>OLD.incoterm OR NEW.reference<>OLD.reference
 OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE(ABORT,'procurement_order_identity_locked') END;
 SELECT CASE WHEN NOT (
 (OLD.status='draft' AND NEW.status='ordered' AND NEW.approved_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.approved_by AND role='admin' AND is_active=1)
 AND EXISTS(SELECT 1 FROM procurement_lines WHERE order_id=OLD.id)
 AND EXISTS(SELECT 1 FROM procurement_suppliers WHERE id=OLD.supplier_id AND active=1))
 OR (OLD.status='draft' AND NEW.status='cancelled' AND NEW.approved_by IS NULL AND NEW.approved_at IS NULL)
 OR (OLD.status='ordered' AND NEW.approved_by IS OLD.approved_by AND NEW.approved_at IS OLD.approved_at
 AND ((NEW.status='closed' AND NOT EXISTS(SELECT 1 FROM procurement_line_balances WHERE order_id=OLD.id AND outstanding_milli>0))
 OR (NEW.status='cancelled' AND NOT EXISTS(SELECT 1 FROM procurement_line_balances WHERE order_id=OLD.id AND received_milli>0)))))
 THEN RAISE(ABORT,'procurement_invalid_transition') END;
END;
CREATE TRIGGER procurement_order_no_delete BEFORE DELETE ON procurement_orders
BEGIN SELECT RAISE(ABORT,'procurement_order_history'); END;
CREATE VIEW procurement_inbound AS
SELECT l.item_id,o.project_id,SUM(l.outstanding_milli) AS ordered_not_received_milli
FROM procurement_line_balances l JOIN procurement_orders o ON o.id=l.order_id
WHERE o.status='ordered' AND l.outstanding_milli>0 GROUP BY l.item_id,o.project_id;
-- Approved demand is a separate operational commitment, not arbitrary engineering JSON.
CREATE TABLE warehouse_project_requirements (
 project_id TEXT NOT NULL REFERENCES warehouse_project_links(project_id),
 item_id TEXT NOT NULL REFERENCES warehouse_items(id),
 quantity_milli INTEGER NOT NULL CHECK(typeof(quantity_milli)='integer' AND quantity_milli BETWEEN 1 AND 1000000000),
 approved_by TEXT NOT NULL REFERENCES admin_users(id),
 PRIMARY KEY(project_id,item_id)
);
CREATE TRIGGER warehouse_requirement_insert BEFORE INSERT ON warehouse_project_requirements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.approved_by AND role='admin' AND is_active=1)
 OR EXISTS(SELECT 1 FROM warehouse_items WHERE id=NEW.item_id AND unit IN ('unit','set','roll','box') AND NEW.quantity_milli%1000<>0)
 THEN RAISE(ABORT,'procurement_requirement_invalid') END;
END;
CREATE TRIGGER warehouse_requirement_no_update BEFORE UPDATE ON warehouse_project_requirements
BEGIN SELECT RAISE(ABORT,'procurement_requirement_revision_required'); END;
CREATE TRIGGER warehouse_requirement_no_delete BEFORE DELETE ON warehouse_project_requirements
BEGIN SELECT RAISE(ABORT,'procurement_requirement_revision_required'); END;
CREATE VIEW procurement_project_shortages AS
SELECT r.project_id,r.item_id,r.quantity_milli AS required_milli,
 COALESCE(p.reserved_milli,0) AS reserved_milli,
 COALESCE(p.issued_milli,0) AS issued_milli,
 COALESCE(p.consumed_milli,0) AS consumed_milli,
 MAX(0,r.quantity_milli-COALESCE(p.reserved_milli,0)-COALESCE(p.issued_milli,0)-COALESCE(p.consumed_milli,0)) AS uncovered_milli,
 MAX(0,w.on_hand_milli-w.reserved_milli) AS shared_available_milli,
 COALESCE(n.ordered_not_received_milli,0) AS ordered_not_received_milli
FROM warehouse_project_requirements r JOIN warehouse_balances w ON w.item_id=r.item_id
LEFT JOIN warehouse_project_balances p ON p.item_id=r.item_id AND p.project_id=r.project_id
LEFT JOIN procurement_inbound n ON n.item_id=r.item_id AND n.project_id=r.project_id;
