-- Residential intake revisions. One request, no new customer accounts or stock movements.
CREATE TABLE residential_survey_versions (
 request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 1000000),
 mode TEXT NOT NULL CHECK(mode IN ('installation','partial','turnkey')),
 body_json TEXT NOT NULL CHECK(json_valid(body_json) AND json_type(body_json)='object' AND length(body_json)<=8192),
 actor_id TEXT NOT NULL REFERENCES admin_users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(request_id,revision)
);
CREATE TRIGGER residential_survey_guard BEFORE INSERT ON residential_survey_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM admin_users WHERE id=NEW.actor_id AND is_active=1 AND role IN ('admin','operator'))
 OR NOT EXISTS(SELECT 1 FROM requests WHERE id=NEW.request_id AND status NOT IN ('cancelled','completed'))
 OR NEW.revision<>COALESCE((SELECT MAX(revision) FROM residential_survey_versions WHERE request_id=NEW.request_id),0)+1
 THEN RAISE(ABORT,'residential_survey_conflict') END;
END;
CREATE TRIGGER residential_survey_no_update BEFORE UPDATE ON residential_survey_versions BEGIN SELECT RAISE(ABORT,'residential_survey_immutable'); END;
CREATE TRIGGER residential_survey_no_delete BEFORE DELETE ON residential_survey_versions BEGIN SELECT RAISE(ABORT,'residential_survey_immutable'); END;
