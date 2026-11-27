-- Additive commercial tariff registry. No seeded prices and no inventory movements.
CREATE TABLE commercial_tariff_versions (
 code TEXT NOT NULL CHECK(length(code) BETWEEN 3 AND 80),
 revision INTEGER NOT NULL CHECK(revision>=1),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 150),
 category TEXT NOT NULL CHECK(category IN ('labor','material','transport','handling','other')),
 unit TEXT NOT NULL CHECK(unit IN ('unit','m','m2','kg','set','hour','visit','trip','service')),
 service_id TEXT REFERENCES services(id) ON DELETE RESTRICT,
 sale_cents INTEGER CHECK(sale_cents IS NULL OR (typeof(sale_cents)='integer' AND sale_cents BETWEEN 0 AND 99999999999)),
 cost_cents INTEGER CHECK(cost_cents IS NULL OR (typeof(cost_cents)='integer' AND cost_cents BETWEEN 0 AND 99999999999)),
 conditions TEXT NOT NULL DEFAULT '' CHECK(length(conditions)<=500),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 created_by TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(code,revision)
);
CREATE VIEW commercial_tariffs AS SELECT t.* FROM commercial_tariff_versions t
 WHERE t.revision=(SELECT MAX(v.revision) FROM commercial_tariff_versions v WHERE v.code=t.code);
CREATE TRIGGER tariff_insert_guard BEFORE INSERT ON commercial_tariff_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.created_by AND is_active=1 AND role='admin')
 OR NEW.revision<>COALESCE((SELECT MAX(revision) FROM commercial_tariff_versions WHERE code=NEW.code),0)+1
 THEN RAISE(ABORT,'tariff_revision_or_actor_invalid') END;
END;
CREATE TRIGGER tariff_no_update BEFORE UPDATE ON commercial_tariff_versions BEGIN SELECT RAISE(ABORT,'tariff_history_immutable'); END;
CREATE TRIGGER tariff_no_delete BEFORE DELETE ON commercial_tariff_versions BEGIN SELECT RAISE(ABORT,'tariff_history_immutable'); END;
