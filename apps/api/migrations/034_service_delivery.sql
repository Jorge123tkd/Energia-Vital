-- Delivery is separate from technical completion and financial settlement.
CREATE TABLE service_deliveries (
 quote_id TEXT PRIMARY KEY REFERENCES service_work_orders(quote_id) ON DELETE RESTRICT,
 reference TEXT NOT NULL UNIQUE CHECK(length(trim(reference)) BETWEEN 3 AND 100),
 delivered_on TEXT NOT NULL,
 customer_name TEXT NOT NULL CHECK(length(trim(customer_name)) BETWEEN 3 AND 300),
 summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 10 AND 2000),
 warranty_terms TEXT NOT NULL CHECK(length(trim(warranty_terms)) BETWEEN 10 AND 2000),
 warranty_end TEXT CHECK(warranty_end IS NULL OR warranty_end>=delivered_on),
 evidence_note TEXT NOT NULL CHECK(length(trim(evidence_note)) BETWEEN 15 AND 900),
 r2_key TEXT NOT NULL UNIQUE CHECK(r2_key GLOB 'private-documents/delivery-*'),
 filename TEXT NOT NULL,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 5 AND 8388608),
 recorded_by TEXT NOT NULL REFERENCES admin_users(id),
 recorded_at TEXT NOT NULL,
 recorded_cuba_date TEXT NOT NULL
);
CREATE TRIGGER service_delivery_guard BEFORE INSERT ON service_deliveries BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.recorded_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM service_work_orders o JOIN warehouse_project_links l ON l.project_id=o.project_id JOIN requests r ON r.id=l.request_id JOIN service_contract_signatures s ON s.quote_id=o.quote_id WHERE o.quote_id=NEW.quote_id AND r.status NOT IN ('cancelled','completed') AND NEW.delivered_on>=s.signed_on AND NEW.delivered_on<=NEW.recorded_cuba_date)
 OR NOT EXISTS(SELECT 1 FROM service_work_assignments a JOIN brigade_work w ON w.id=a.work_id JOIN technical_work_reports tr ON tr.work_id=w.id WHERE a.quote_id=NEW.quote_id AND w.status='completed' AND tr.report_type='completion_proposed' AND tr.review_status='accepted' AND w.work_date<=NEW.delivered_on)
 OR EXISTS(SELECT 1 FROM service_work_orders o JOIN warehouse_project_links l ON l.project_id=o.project_id JOIN brigade_work w ON w.request_id=l.request_id WHERE o.quote_id=NEW.quote_id AND (w.status IN ('scheduled','pending_approval') OR (w.status='completed' AND w.work_date>NEW.delivered_on)))
 OR EXISTS(SELECT 1 FROM service_work_assignments a JOIN brigade_work w ON w.id=a.work_id WHERE a.quote_id=NEW.quote_id AND w.status='completed' AND NOT EXISTS(SELECT 1 FROM technical_work_reports tr WHERE tr.work_id=w.id AND tr.report_type='completion_proposed' AND tr.review_status='accepted'))
 OR EXISTS(SELECT 1 FROM service_work_orders o JOIN warehouse_project_balances b ON b.project_id=o.project_id WHERE o.quote_id=NEW.quote_id AND (b.reserved_milli<>0 OR b.issued_milli<>0))
 THEN RAISE(ABORT,'service_delivery_not_ready') END;
END;
CREATE TRIGGER service_delivery_no_update BEFORE UPDATE ON service_deliveries BEGIN SELECT RAISE(ABORT,'service_delivery_immutable'); END;
CREATE TRIGGER service_delivery_no_delete BEFORE DELETE ON service_deliveries BEGIN SELECT RAISE(ABORT,'service_delivery_immutable'); END;
CREATE TRIGGER service_delivery_no_new_assignment BEFORE INSERT ON service_work_assignments
WHEN EXISTS(SELECT 1 FROM service_deliveries WHERE quote_id=NEW.quote_id)
BEGIN SELECT RAISE(ABORT,'service_delivery_already_recorded'); END;
CREATE TRIGGER service_delivery_request_close_guard BEFORE UPDATE OF status ON requests
WHEN NEW.status='completed' AND OLD.status<>'completed' AND EXISTS(
 SELECT 1 FROM warehouse_project_links l JOIN service_work_orders o ON o.project_id=l.project_id WHERE l.request_id=NEW.id AND NOT EXISTS(SELECT 1 FROM service_deliveries d WHERE d.quote_id=o.quote_id))
BEGIN SELECT RAISE(ABORT,'service_delivery_required'); END;
