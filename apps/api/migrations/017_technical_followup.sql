-- Bonaire fase 5A — evidencias técnicas y posventa SIN contratos, firmas ni cobros.
-- Migración estrictamente aditiva; conserva trabajos, solicitudes, fotos y citas.
-- El jefe de brigada aún NO tiene identidad de inicio de sesión: se distingue
-- información retransmitida por el jefe de observaciones realizadas por personal.
CREATE TABLE IF NOT EXISTS technical_work_reports (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES brigade_work(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK(report_type IN ('progress','incident','completion_proposed')),
  information_source TEXT NOT NULL CHECK(information_source IN ('staff_observed','chief_relayed')),
  summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 8 AND 1500),
  evidence_note TEXT CHECK(evidence_note IS NULL OR length(trim(evidence_note)) BETWEEN 20 AND 1200),
  evidence_image_id TEXT REFERENCES request_images(id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'note_only' CHECK(review_status IN
    ('note_only','pending_review','accepted','rejected')),
  reviewed_by TEXT REFERENCES admin_users(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_note TEXT CHECK(review_note IS NULL OR length(trim(review_note)) BETWEEN 3 AND 1000),
  created_at TEXT NOT NULL,
  CHECK ((report_type='completion_proposed' AND evidence_note IS NOT NULL AND
          review_status IN ('pending_review','accepted','rejected'))
     OR (report_type IN ('progress','incident') AND review_status='note_only'))
);
CREATE INDEX IF NOT EXISTS idx_technical_reports_work
  ON technical_work_reports(work_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technical_reports_review
  ON technical_work_reports(review_status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_technical_report_one_pending
  ON technical_work_reports(work_id) WHERE review_status='pending_review';

CREATE TRIGGER IF NOT EXISTS trg_technical_report_guard_insert
BEFORE INSERT ON technical_work_reports
WHEN NOT EXISTS (
  SELECT 1 FROM brigade_work w WHERE w.id=NEW.work_id AND w.status='scheduled'
) OR (
  NEW.evidence_image_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM request_images img JOIN brigade_work w ON w.request_id=img.request_id
    WHERE w.id=NEW.work_id AND img.id=NEW.evidence_image_id
  )
)
BEGIN
  SELECT RAISE(ABORT,'El informe exige trabajo programado y fotografía de la misma solicitud');
END;
CREATE TRIGGER IF NOT EXISTS trg_technical_report_content_locked
BEFORE UPDATE OF work_id,actor_id,report_type,information_source,summary,
                 evidence_note,evidence_image_id,created_at ON technical_work_reports
BEGIN SELECT RAISE(ABORT,'El informe técnico no se modifica; registrar uno nuevo'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_report_no_delete
BEFORE DELETE ON technical_work_reports
BEGIN SELECT RAISE(ABORT,'No se borra el historial técnico'); END;
CREATE TRIGGER IF NOT EXISTS trg_technical_report_review_guard
BEFORE UPDATE OF review_status,reviewed_by,reviewed_at,review_note ON technical_work_reports
WHEN OLD.review_status<>'pending_review'
 OR NEW.report_type<>'completion_proposed'
 OR NEW.review_status NOT IN ('accepted','rejected')
 OR NEW.reviewed_at IS NULL
 OR NOT EXISTS (
    SELECT 1 FROM admin_users au WHERE au.id=NEW.reviewed_by
      AND au.is_active=1 AND au.role='admin'
 )
 OR (
   NEW.review_status='accepted'
   AND length(trim(COALESCE(NEW.review_note,'')))<12
 )
 OR (
   NEW.review_status='rejected'
   AND length(trim(COALESCE(NEW.review_note,'')))<3
 )
BEGIN SELECT RAISE(ABORT,'La revisión final exige administrador principal activo y justificación'); END;

-- Finalización solo después de informe técnico aceptado por el administrador,
-- sin alterar el estado comercial de solicitud/citas o registrar cobros.
CREATE TRIGGER IF NOT EXISTS trg_brigade_completed_with_report
BEFORE UPDATE OF status ON brigade_work
WHEN NEW.status='completed' AND OLD.status<>'completed'
AND (
  OLD.status<>'scheduled'
  OR NOT EXISTS (
    SELECT 1 FROM technical_work_reports tr
    JOIN admin_users a ON a.id=tr.reviewed_by
    WHERE tr.work_id=OLD.id AND tr.report_type='completion_proposed'
    AND tr.review_status='accepted' AND a.role='admin' AND a.is_active=1
  )
)
BEGIN SELECT RAISE(ABORT,'El cierre técnico requiere informe aceptado por administrador'); END;
CREATE TRIGGER IF NOT EXISTS trg_brigade_completed_no_reopen
BEFORE UPDATE OF status ON brigade_work
WHEN OLD.status='completed' AND NEW.status<>'completed'
BEGIN SELECT RAISE(ABORT,'El trabajo finalizado no se reabre silenciosamente'); END;

CREATE TABLE IF NOT EXISTS service_followup_cases (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  work_id TEXT REFERENCES brigade_work(id) ON DELETE RESTRICT,
  case_type TEXT NOT NULL CHECK(case_type IN ('incident','warranty_claim','post_sale_followup')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 180),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 8 AND 1500),
  warranty_claim_details TEXT CHECK(warranty_claim_details IS NULL OR
    length(trim(warranty_claim_details)) BETWEEN 3 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  opened_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_by TEXT REFERENCES admin_users(id) ON DELETE RESTRICT,
  resolved_at TEXT,
  resolution_note TEXT CHECK(resolution_note IS NULL OR
    length(trim(resolution_note)) BETWEEN 12 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_service_case_request
  ON service_followup_cases(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_case_open
  ON service_followup_cases(status,priority,created_at);

CREATE TRIGGER IF NOT EXISTS trg_service_case_work_guard
BEFORE INSERT ON service_followup_cases
WHEN NEW.work_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM brigade_work w WHERE w.id=NEW.work_id AND w.request_id=NEW.request_id
)
BEGIN SELECT RAISE(ABORT,'El caso debe pertenecer a la misma solicitud del trabajo'); END;
CREATE TRIGGER IF NOT EXISTS trg_service_case_immutable
BEFORE UPDATE OF request_id,work_id,case_type,priority,title,description,
                 warranty_claim_details,opened_by,created_at ON service_followup_cases
BEGIN SELECT RAISE(ABORT,'El caso original no se reescribe; agrega seguimiento'); END;
CREATE TRIGGER IF NOT EXISTS trg_service_case_no_delete
BEFORE DELETE ON service_followup_cases
BEGIN SELECT RAISE(ABORT,'No se elimina el historial de casos técnicos'); END;
CREATE TRIGGER IF NOT EXISTS trg_service_case_resolve_guard
BEFORE UPDATE OF status,resolved_by,resolved_at,resolution_note ON service_followup_cases
WHEN OLD.status<>'open' OR NEW.status<>'resolved'
 OR NEW.resolved_at IS NULL
 OR length(trim(COALESCE(NEW.resolution_note,'')))<12
 OR NOT EXISTS (
   SELECT 1 FROM admin_users au WHERE au.id=NEW.resolved_by
   AND au.role='admin' AND au.is_active=1
 )
BEGIN SELECT RAISE(ABORT,'Cerrar caso requiere administrador principal y constancia detallada'); END;

CREATE TABLE IF NOT EXISTS service_case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES service_followup_cases(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 1000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_service_case_notes
  ON service_case_notes(case_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_service_case_notes_no_update
BEFORE UPDATE ON service_case_notes
BEGIN SELECT RAISE(ABORT,'Las notas técnicas son inmutables'); END;
CREATE TRIGGER IF NOT EXISTS trg_service_case_notes_no_delete
BEFORE DELETE ON service_case_notes
BEGIN SELECT RAISE(ABORT,'No se borran las notas del caso'); END;
