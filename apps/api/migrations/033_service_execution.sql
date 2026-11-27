-- Contract-backed execution authorization. Existing calendar/warehouse records remain unchanged.
CREATE TABLE service_work_orders (
 quote_id TEXT PRIMARY KEY REFERENCES service_contract_signatures(quote_id) ON DELETE RESTRICT,
 project_id TEXT NOT NULL REFERENCES warehouse_project_links(project_id) ON DELETE RESTRICT,
 reference TEXT NOT NULL UNIQUE CHECK(length(reference) BETWEEN 3 AND 100),
 scope TEXT NOT NULL CHECK(length(trim(scope)) BETWEEN 3 AND 2000),
 readiness_note TEXT NOT NULL CHECK(length(trim(readiness_note)) BETWEEN 15 AND 1000),
 material_mode TEXT NOT NULL CHECK(material_mode IN ('warehouse','customer_only')),
 approved_by TEXT NOT NULL REFERENCES admin_users(id),
 approved_at TEXT NOT NULL
);
CREATE TRIGGER service_work_order_guard BEFORE INSERT ON service_work_orders BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.approved_by AND role='admin' AND is_active=1)
 OR NOT EXISTS(SELECT 1 FROM warehouse_project_links l JOIN commercial_quote_versions q ON q.request_id=l.request_id JOIN requests r ON r.id=q.request_id JOIN service_contract_signatures s ON s.quote_id=q.id WHERE l.project_id=NEW.project_id AND q.id=NEW.quote_id AND r.status NOT IN ('cancelled','completed'))
 OR (NEW.material_mode='warehouse' AND NOT EXISTS(SELECT 1 FROM warehouse_project_requirements WHERE project_id=NEW.project_id))
 OR (NEW.material_mode='customer_only' AND EXISTS(SELECT 1 FROM warehouse_project_requirements WHERE project_id=NEW.project_id))
 OR EXISTS(SELECT 1 FROM procurement_project_shortages WHERE project_id=NEW.project_id AND uncovered_milli>0)
 THEN RAISE(ABORT,'service_work_order_not_ready') END;
END;
CREATE TABLE service_work_assignments (
 work_id TEXT PRIMARY KEY REFERENCES brigade_work(id) ON DELETE RESTRICT,
 quote_id TEXT NOT NULL REFERENCES service_work_orders(quote_id) ON DELETE RESTRICT
);
CREATE TRIGGER service_work_assignment_guard BEFORE INSERT ON service_work_assignments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM service_work_orders o JOIN warehouse_project_links l ON l.project_id=o.project_id JOIN brigade_work w ON w.request_id=l.request_id JOIN requests r ON r.id=w.request_id WHERE o.quote_id=NEW.quote_id AND w.id=NEW.work_id AND w.status IN ('scheduled','pending_approval') AND r.status NOT IN ('cancelled','completed'))
 OR EXISTS(SELECT 1 FROM service_work_orders o JOIN procurement_project_shortages s ON s.project_id=o.project_id WHERE o.quote_id=NEW.quote_id AND s.uncovered_milli>0)
 THEN RAISE(ABORT,'service_work_assignment_not_ready') END;
END;
CREATE TRIGGER service_work_review_guard BEFORE UPDATE OF status ON brigade_work
WHEN OLD.status='pending_approval' AND NEW.status='scheduled' AND EXISTS(SELECT 1 FROM service_work_assignments a JOIN service_work_orders o ON o.quote_id=a.quote_id JOIN procurement_project_shortages s ON s.project_id=o.project_id WHERE a.work_id=NEW.id AND s.uncovered_milli>0)
BEGIN SELECT RAISE(ABORT,'service_work_assignment_not_ready'); END;
CREATE TRIGGER service_work_order_no_update BEFORE UPDATE ON service_work_orders BEGIN SELECT RAISE(ABORT,'service_work_order_immutable'); END;
CREATE TRIGGER service_work_order_no_delete BEFORE DELETE ON service_work_orders BEGIN SELECT RAISE(ABORT,'service_work_order_immutable'); END;
CREATE TRIGGER service_work_assignment_no_update BEFORE UPDATE ON service_work_assignments BEGIN SELECT RAISE(ABORT,'service_work_assignment_immutable'); END;
CREATE TRIGGER service_work_assignment_no_delete BEFORE DELETE ON service_work_assignments BEGIN SELECT RAISE(ABORT,'service_work_assignment_immutable'); END;
