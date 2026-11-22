-- Future warehouse authority. Additive only; never copy published catalog quantities.
-- All quantities use integer thousandths of the item's fixed stock unit.
CREATE TABLE warehouse_items (
 id TEXT PRIMARY KEY, product_id TEXT UNIQUE REFERENCES products(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 unit TEXT NOT NULL CHECK(unit IN ('unit','m','m2','kg','set','roll','box')),
 created_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE warehouse_movements (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES warehouse_items(id),
 project_id TEXT,
 kind TEXT NOT NULL CHECK(kind IN ('receive','reserve','release','issue','consume','return')),
 quantity_milli INTEGER NOT NULL CHECK(typeof(quantity_milli)='integer' AND quantity_milli BETWEEN 1 AND 1000000000),
 actor TEXT NOT NULL REFERENCES admin_users(id),
 reference TEXT NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='receive' AND project_id IS NULL) OR (kind<>'receive' AND project_id IS NOT NULL AND length(project_id) BETWEEN 1 AND 100))
);
CREATE INDEX warehouse_movement_item ON warehouse_movements(item_id,project_id,kind);
CREATE VIEW warehouse_balances AS
SELECT i.id AS item_id,
 COALESCE(SUM(CASE m.kind WHEN 'receive' THEN m.quantity_milli WHEN 'issue' THEN -m.quantity_milli WHEN 'return' THEN m.quantity_milli ELSE 0 END),0) AS on_hand_milli,
 COALESCE(SUM(CASE m.kind WHEN 'reserve' THEN m.quantity_milli WHEN 'release' THEN -m.quantity_milli WHEN 'issue' THEN -m.quantity_milli ELSE 0 END),0) AS reserved_milli,
 COALESCE(SUM(CASE m.kind WHEN 'issue' THEN m.quantity_milli WHEN 'consume' THEN -m.quantity_milli WHEN 'return' THEN -m.quantity_milli ELSE 0 END),0) AS issued_milli
FROM warehouse_items i LEFT JOIN warehouse_movements m ON m.item_id=i.id GROUP BY i.id;
CREATE VIEW warehouse_project_balances AS
SELECT item_id,project_id,
 SUM(CASE kind WHEN 'reserve' THEN quantity_milli WHEN 'release' THEN -quantity_milli WHEN 'issue' THEN -quantity_milli ELSE 0 END) AS reserved_milli,
 SUM(CASE kind WHEN 'issue' THEN quantity_milli WHEN 'consume' THEN -quantity_milli WHEN 'return' THEN -quantity_milli ELSE 0 END) AS issued_milli,
 SUM(CASE kind WHEN 'consume' THEN quantity_milli ELSE 0 END) AS consumed_milli
FROM warehouse_movements WHERE project_id IS NOT NULL GROUP BY item_id,project_id;
CREATE TRIGGER warehouse_guard BEFORE INSERT ON warehouse_movements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.actor AND is_active=1 AND role='admin')
 THEN RAISE(ABORT,'warehouse_actor_not_authorized') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM warehouse_items WHERE id=NEW.item_id AND unit IN ('unit','set','roll','box') AND NEW.quantity_milli%1000<>0)
 THEN RAISE(ABORT,'warehouse_whole_unit_required') END;
 SELECT CASE WHEN NEW.kind='reserve' AND NEW.quantity_milli>COALESCE((SELECT on_hand_milli-reserved_milli FROM warehouse_balances WHERE item_id=NEW.item_id),0)
 THEN RAISE(ABORT,'warehouse_insufficient_available') END;
 SELECT CASE WHEN NEW.kind IN ('release','issue') AND NEW.quantity_milli>COALESCE((SELECT reserved_milli FROM warehouse_project_balances WHERE item_id=NEW.item_id AND project_id=NEW.project_id),0)
 THEN RAISE(ABORT,'warehouse_insufficient_reservation') END;
 SELECT CASE WHEN NEW.kind IN ('consume','return') AND NEW.quantity_milli>COALESCE((SELECT issued_milli FROM warehouse_project_balances WHERE item_id=NEW.item_id AND project_id=NEW.project_id),0)
 THEN RAISE(ABORT,'warehouse_insufficient_issued') END;
END;
CREATE TRIGGER warehouse_movement_no_update BEFORE UPDATE ON warehouse_movements BEGIN
 SELECT RAISE(ABORT,'warehouse_immutable_movement');
END;
CREATE TRIGGER warehouse_movement_no_delete BEFORE DELETE ON warehouse_movements BEGIN
 SELECT RAISE(ABORT,'warehouse_immutable_movement');
END;
CREATE TRIGGER warehouse_item_unit_guard BEFORE UPDATE OF unit,product_id ON warehouse_items
WHEN EXISTS(SELECT 1 FROM warehouse_movements WHERE item_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'warehouse_item_identity_locked'); END;
