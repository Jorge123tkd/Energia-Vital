-- Operational finance pilot. No bank connection, no automatic accounting or FX.
-- Keep customer references in USD cents as in the existing commercial module.
CREATE TABLE business_project_contracts (
 project_id TEXT PRIMARY KEY REFERENCES warehouse_project_links(project_id),
 quote_id TEXT NOT NULL UNIQUE REFERENCES commercial_quote_versions(id),
 contract_reference TEXT NOT NULL CHECK(length(trim(contract_reference)) BETWEEN 3 AND 200),
 acceptance_evidence TEXT NOT NULL CHECK(length(trim(acceptance_evidence)) BETWEEN 15 AND 900),
 accepted_on TEXT NOT NULL CHECK(accepted_on GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 due_on TEXT CHECK(due_on IS NULL OR (due_on GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' AND due_on>=accepted_on)),
 recorded_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER business_contract_guard BEFORE INSERT ON business_project_contracts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.recorded_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM warehouse_project_links l JOIN commercial_quote_versions q ON q.request_id=l.request_id
 JOIN requests r ON r.id=l.request_id WHERE l.project_id=NEW.project_id AND q.id=NEW.quote_id
 AND q.status='approved_internal' AND q.total_cents>0 AND q.currency='USD'
 AND q.valid_until>=NEW.accepted_on AND r.status<>'cancelled')
 THEN RAISE(ABORT,'business_contract_not_authorized') END;
END;
CREATE TRIGGER business_contract_no_update BEFORE UPDATE ON business_project_contracts BEGIN SELECT RAISE(ABORT,'business_contract_revision_required'); END;
CREATE TRIGGER business_contract_no_delete BEFORE DELETE ON business_project_contracts BEGIN SELECT RAISE(ABORT,'business_contract_history'); END;
-- Customer receipts remain in request_payment_reports. Do not copy or book them again.
-- Verified reports are reference USD values, not an independently reconciled cash ledger.
CREATE VIEW business_project_receivables AS
SELECT c.project_id,l.request_id,c.quote_id,c.contract_reference,c.accepted_on,c.due_on,q.total_cents AS contracted_usd_cents,
 COALESCE((SELECT SUM(p.amount_usd_cents) FROM request_payment_reports p WHERE p.request_id=l.request_id AND p.verification_status='verified_manual'),0) AS manually_verified_usd_cents,
 COALESCE((SELECT SUM(p.amount_usd_cents) FROM request_payment_reports p WHERE p.request_id=l.request_id AND p.verification_status='reported'),0) AS reported_unverified_usd_cents,
 MAX(0,q.total_cents-COALESCE((SELECT SUM(p.amount_usd_cents) FROM request_payment_reports p WHERE p.request_id=l.request_id AND p.verification_status='verified_manual'),0)) AS outstanding_reference_usd_cents,
 MAX(0,COALESCE((SELECT SUM(p.amount_usd_cents) FROM request_payment_reports p WHERE p.request_id=l.request_id AND p.verification_status='verified_manual'),0)-q.total_cents) AS excess_reference_usd_cents
FROM business_project_contracts c JOIN warehouse_project_links l ON l.project_id=c.project_id JOIN commercial_quote_versions q ON q.id=c.quote_id;
-- Documented obligations in their original currency. Purchase order total is not
-- an expense or payable by itself. One invoice per order in this first pilot;
-- other costs use a separate document, never an additional copy of goods.
CREATE TABLE business_obligations (
 id TEXT PRIMARY KEY,
 project_id TEXT REFERENCES warehouse_project_links(project_id),
 purchase_order_id TEXT UNIQUE REFERENCES procurement_orders(id),
 supplier_id TEXT NOT NULL REFERENCES procurement_suppliers(id),
 category TEXT NOT NULL CHECK(category IN ('goods','freight','customs','insurance','installation','labor','other')),
 currency TEXT NOT NULL CHECK(currency IN ('USD','CUP','EUR','CNY')),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 1000000000000),
 document_reference TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(document_reference)) BETWEEN 3 AND 200),
 evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 15 AND 900),
 issued_on TEXT NOT NULL CHECK(issued_on GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 due_on TEXT CHECK(due_on IS NULL OR (due_on GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' AND due_on>=issued_on)),
 recorded_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(supplier_id,document_reference),
 CHECK((category='goods' AND purchase_order_id IS NOT NULL) OR (category<>'goods' AND purchase_order_id IS NULL AND project_id IS NOT NULL))
);
CREATE TRIGGER business_obligation_guard BEFORE INSERT ON business_obligations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.recorded_by AND role='admin' AND is_active=1)
 THEN RAISE(ABORT,'business_actor_not_authorized') END;
 SELECT CASE WHEN NEW.category='goods' AND NOT EXISTS(SELECT 1 FROM procurement_orders o WHERE o.id=NEW.purchase_order_id
 AND o.supplier_id=NEW.supplier_id AND o.project_id IS NEW.project_id AND o.currency=NEW.currency AND o.status IN ('ordered','closed')
 AND NEW.amount_minor=(SELECT SUM(total_minor) FROM procurement_lines WHERE order_id=o.id))
 THEN RAISE(ABORT,'business_goods_invoice_mismatch') END;
END;
CREATE TRIGGER business_obligation_no_update BEFORE UPDATE ON business_obligations BEGIN SELECT RAISE(ABORT,'business_obligation_immutable'); END;
CREATE TRIGGER business_obligation_no_delete BEFORE DELETE ON business_obligations BEGIN SELECT RAISE(ABORT,'business_obligation_history'); END;
CREATE TABLE business_supplier_payments (
 id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES business_obligations(id),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 1000000000000),
 reference TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(reference)) BETWEEN 4 AND 150),
 paid_on TEXT NOT NULL CHECK(paid_on GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 evidence TEXT NOT NULL CHECK(length(trim(evidence)) BETWEEN 15 AND 900),
 recorded_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(reference)
);
CREATE TRIGGER business_payment_guard BEFORE INSERT ON business_supplier_payments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.recorded_by AND role='admin' AND is_active=1)
 THEN RAISE(ABORT,'business_actor_not_authorized') END;
 SELECT CASE WHEN NEW.amount_minor>COALESCE((SELECT o.amount_minor-COALESCE((SELECT SUM(p.amount_minor) FROM business_supplier_payments p WHERE p.obligation_id=o.id),0)
 FROM business_obligations o WHERE o.id=NEW.obligation_id),0)
 THEN RAISE(ABORT,'business_payment_overallocation') END;
END;
CREATE TRIGGER business_payment_no_update BEFORE UPDATE ON business_supplier_payments BEGIN SELECT RAISE(ABORT,'business_payment_immutable'); END;
CREATE TRIGGER business_payment_no_delete BEFORE DELETE ON business_supplier_payments BEGIN SELECT RAISE(ABORT,'business_payment_history'); END;
CREATE VIEW business_payables AS
SELECT o.id,o.project_id,o.purchase_order_id,o.supplier_id,o.category,o.currency,o.document_reference,o.due_on,o.amount_minor,
 COALESCE((SELECT SUM(p.amount_minor) FROM business_supplier_payments p WHERE p.obligation_id=o.id),0) AS manually_recorded_paid_minor,
 o.amount_minor-COALESCE((SELECT SUM(p.amount_minor) FROM business_supplier_payments p WHERE p.obligation_id=o.id),0) AS outstanding_minor
FROM business_obligations o;
CREATE VIEW business_project_obligations AS
SELECT project_id,currency,category,SUM(amount_minor) AS documented_minor,SUM(manually_recorded_paid_minor) AS paid_minor,SUM(outstanding_minor) AS outstanding_minor
FROM business_payables WHERE project_id IS NOT NULL GROUP BY project_id,currency,category;
-- Keep commitments separate. No adding purchase order totals to the invoice totals.
CREATE VIEW business_purchase_commitments AS
SELECT o.project_id,o.currency,SUM(l.total_minor) AS uninvoiced_committed_minor
FROM procurement_orders o JOIN procurement_lines l ON l.order_id=o.id
WHERE o.status IN ('ordered','closed') AND NOT EXISTS(SELECT 1 FROM business_obligations b WHERE b.purchase_order_id=o.id)
GROUP BY o.project_id,o.currency;
