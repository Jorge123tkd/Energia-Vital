-- Bonaire 5B2: enlaza propuesta original del jefe autenticado con
-- revisión del administrador en el mecanismo de cierre técnico existente 5A.
-- No altera tablas ni datos históricos; no genera certificados ni firma legal.
CREATE TABLE IF NOT EXISTS chief_completion_reviews (
  id TEXT PRIMARY KEY,
  chief_report_id TEXT NOT NULL UNIQUE REFERENCES brigade_chief_reports(id) ON DELETE RESTRICT,
  technical_report_id TEXT NOT NULL UNIQUE REFERENCES technical_work_reports(id) ON DELETE RESTRICT,
  reviewed_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chief_completion_by_admin
  ON chief_completion_reviews(reviewed_by,created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_chief_completion_review_insert_guard
BEFORE INSERT ON chief_completion_reviews
WHEN NOT EXISTS (
  SELECT 1
  FROM brigade_chief_reports cr
  JOIN technical_work_reports tr ON tr.work_id=cr.work_id
  JOIN admin_users admin ON admin.id=NEW.reviewed_by
  JOIN brigade_work w ON w.id=cr.work_id
  WHERE cr.id=NEW.chief_report_id AND tr.id=NEW.technical_report_id
    AND cr.report_type='completion_proposed'
    AND tr.report_type='completion_proposed'
    AND tr.information_source='chief_relayed'
    AND tr.summary=cr.summary
    AND tr.evidence_note=cr.evidence_note
    AND tr.actor_id=admin.id
    AND tr.review_status='pending_review'
    AND admin.role='admin' AND admin.is_active=1
    AND w.status='scheduled'
)
BEGIN SELECT RAISE(ABORT,'La propuesta del jefe exige vinculación exacta y administrador activo'); END;

CREATE TRIGGER IF NOT EXISTS trg_chief_completion_review_no_update
BEFORE UPDATE ON chief_completion_reviews
BEGIN SELECT RAISE(ABORT,'La revisión vinculada al jefe es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_chief_completion_review_no_delete
BEFORE DELETE ON chief_completion_reviews
BEGIN SELECT RAISE(ABORT,'No se borran revisiones de propuestas del jefe'); END;
