-- Additive link between Studio project IDs and existing commercial requests.
-- This is a verified mapping, not a second request or brigade system.
CREATE TABLE warehouse_project_links (
 project_id TEXT PRIMARY KEY CHECK(length(project_id) BETWEEN 1 AND 100),
 request_id TEXT NOT NULL UNIQUE REFERENCES requests(id) ON DELETE RESTRICT,
 linked_by TEXT NOT NULL REFERENCES admin_users(id),
 linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER warehouse_link_admin BEFORE INSERT ON warehouse_project_links
WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.linked_by AND is_active=1 AND role='admin')
BEGIN SELECT RAISE(ABORT,'warehouse_actor_not_authorized'); END;
CREATE TRIGGER warehouse_link_no_update BEFORE UPDATE ON warehouse_project_links
BEGIN SELECT RAISE(ABORT,'warehouse_link_immutable'); END;
CREATE TRIGGER warehouse_link_no_delete BEFORE DELETE ON warehouse_project_links
BEGIN SELECT RAISE(ABORT,'warehouse_link_immutable'); END;
ALTER TABLE warehouse_movements ADD COLUMN work_id TEXT REFERENCES brigade_work(id) ON DELETE RESTRICT;
CREATE INDEX warehouse_work_item ON warehouse_movements(work_id,item_id,kind);
CREATE VIEW warehouse_work_balances AS
SELECT m.work_id,m.item_id,m.project_id,
 SUM(CASE m.kind WHEN 'issue' THEN m.quantity_milli WHEN 'consume' THEN -m.quantity_milli WHEN 'return' THEN -m.quantity_milli ELSE 0 END) AS outstanding_milli,
 SUM(CASE m.kind WHEN 'issue' THEN m.quantity_milli ELSE 0 END) AS delivered_milli,
 SUM(CASE m.kind WHEN 'consume' THEN m.quantity_milli ELSE 0 END) AS consumed_milli,
 SUM(CASE m.kind WHEN 'return' THEN m.quantity_milli ELSE 0 END) AS returned_milli
FROM warehouse_movements m WHERE m.work_id IS NOT NULL GROUP BY m.work_id,m.item_id,m.project_id;
CREATE TRIGGER warehouse_work_guard BEFORE INSERT ON warehouse_movements BEGIN
 SELECT CASE WHEN NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM warehouse_project_links WHERE project_id=NEW.project_id)
 THEN RAISE(ABORT,'warehouse_project_not_linked') END;
 SELECT CASE WHEN NEW.kind IN ('receive','reserve','release') AND NEW.work_id IS NOT NULL
 THEN RAISE(ABORT,'warehouse_work_not_applicable') END;
 SELECT CASE WHEN NEW.kind IN ('issue','consume','return') AND NOT EXISTS(
 SELECT 1 FROM brigade_work w JOIN warehouse_project_links l ON l.request_id=w.request_id
 JOIN brigades b ON b.id=w.brigade_id JOIN requests r ON r.id=w.request_id
 WHERE w.id=NEW.work_id AND l.project_id=NEW.project_id AND
 (NEW.kind<>'issue' OR (w.status='scheduled' AND b.is_active=1 AND r.status NOT IN ('cancelled','completed'))))
 THEN RAISE(ABORT,'warehouse_work_not_authorized') END;
 -- Returns/consumption reconcile an existing delivery even if an order was later cancelled.
 SELECT CASE WHEN NEW.kind IN ('consume','return') AND NEW.quantity_milli>COALESCE(
 (SELECT outstanding_milli FROM warehouse_work_balances WHERE work_id=NEW.work_id AND item_id=NEW.item_id AND project_id=NEW.project_id),0)
 THEN RAISE(ABORT,'warehouse_insufficient_work_delivery') END;
END;
