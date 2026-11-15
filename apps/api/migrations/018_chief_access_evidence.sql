-- Bonaire 5B. Acceso de jefe técnico INDEPENDIENTE de admin/customer.
-- No ALTER de auth_sessions/JWT ni admin_users: evita ampliar privilegios.
-- Solo dirección puede crear/activar credenciales de jefes, sin datos iniciales.
CREATE TABLE IF NOT EXISTS brigade_chief_accounts (
  id TEXT PRIMARY KEY,
  brigade_id TEXT NOT NULL UNIQUE REFERENCES brigades(id) ON DELETE RESTRICT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
  created_by TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chief_account_active
 ON brigade_chief_accounts(brigade_id,is_active);

-- Cambiar el jefe nominal o desactivar la brigada BLOQUEA la credencial
-- del jefe anterior. Reactivación exige revisión manual y nueva contraseña.
CREATE TRIGGER IF NOT EXISTS trg_brigade_chief_disable_on_change
AFTER UPDATE OF leader_name,is_active ON brigades
WHEN OLD.leader_name<>NEW.leader_name
  OR (OLD.is_active=1 AND NEW.is_active=0)
BEGIN
  UPDATE brigade_chief_accounts SET is_active=0,updated_at=NEW.updated_at
    WHERE brigade_id=NEW.id AND is_active=1;
END;

-- Almacenar exclusivamente SHA-256 del token aleatorio, NO el token en D1.
CREATE TABLE IF NOT EXISTS brigade_chief_sessions (
  id TEXT PRIMARY KEY,
  chief_id TEXT NOT NULL REFERENCES brigade_chief_accounts(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chief_sessions_active
 ON brigade_chief_sessions(token_hash,expires_at,revoked_at);

CREATE TRIGGER IF NOT EXISTS trg_chief_account_revoke_sessions
AFTER UPDATE OF password_hash,is_active ON brigade_chief_accounts
WHEN OLD.password_hash<>NEW.password_hash
  OR (OLD.is_active=1 AND NEW.is_active=0)
BEGIN
  UPDATE brigade_chief_sessions
  SET revoked_at=NEW.updated_at
  WHERE chief_id=NEW.id AND revoked_at IS NULL;
END;

-- Informe auténticamente ingresado con la cuenta del jefe; no firma electrónica
-- ni certificado legal. No altera informe/decisión administrativa de 5A.
CREATE TABLE IF NOT EXISTS brigade_chief_reports (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES brigade_work(id) ON DELETE RESTRICT,
  chief_id TEXT NOT NULL REFERENCES brigade_chief_accounts(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK(report_type IN ('progress','incident','completion_proposed')),
  summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 8 AND 1500),
  evidence_note TEXT CHECK(evidence_note IS NULL OR length(trim(evidence_note)) BETWEEN 20 AND 1200),
  created_at TEXT NOT NULL,
  CHECK(report_type<>'completion_proposed' OR evidence_note IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_chief_reports_work
 ON brigade_chief_reports(work_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_chief_report_guard
BEFORE INSERT ON brigade_chief_reports
WHEN NOT EXISTS (
  SELECT 1 FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id
  JOIN brigade_chief_accounts chief ON chief.brigade_id=b.id
  WHERE w.id=NEW.work_id AND w.status='scheduled' AND b.is_active=1
    AND chief.id=NEW.chief_id AND chief.is_active=1
)
BEGIN SELECT RAISE(ABORT,'Jefe no asignado a este trabajo programado'); END;
CREATE TRIGGER IF NOT EXISTS trg_chief_report_no_edit
BEFORE UPDATE ON brigade_chief_reports
BEGIN SELECT RAISE(ABORT,'Los informes del jefe no se reescriben'); END;
CREATE TRIGGER IF NOT EXISTS trg_chief_report_no_delete
BEFORE DELETE ON brigade_chief_reports
BEGIN SELECT RAISE(ABORT,'No se borran informes históricos del jefe'); END;

-- Evidencia binaria en R2 privado, solo la metadata verificable en D1.
-- Cada foto se enlaza a trabajo + jefe y nunca sirve como certificado.
CREATE TABLE IF NOT EXISTS brigade_evidence_images (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES brigade_work(id) ON DELETE RESTRICT,
  chief_id TEXT NOT NULL REFERENCES brigade_chief_accounts(id) ON DELETE RESTRICT,
  report_id TEXT REFERENCES brigade_chief_reports(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK(stage IN ('before','during','after')),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  sha256_hex TEXT NOT NULL CHECK(length(sha256_hex)=64),
  captured_note TEXT CHECK(captured_note IS NULL OR length(trim(captured_note)) BETWEEN 5 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brigade_evidence_work
 ON brigade_evidence_images(work_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_brigade_evidence_guard
BEFORE INSERT ON brigade_evidence_images
WHEN NOT EXISTS (
  SELECT 1 FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id
  JOIN brigade_chief_accounts chief ON chief.brigade_id=b.id
  WHERE w.id=NEW.work_id AND w.status='scheduled' AND b.is_active=1
    AND chief.id=NEW.chief_id AND chief.is_active=1
)
OR (SELECT COUNT(*) FROM brigade_evidence_images WHERE work_id=NEW.work_id)>=12
OR (NEW.report_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM brigade_chief_reports r WHERE r.id=NEW.report_id
   AND r.work_id=NEW.work_id AND r.chief_id=NEW.chief_id
))
BEGIN SELECT RAISE(ABORT,'Foto fuera de brigada, informe o límite de 12 evidencias'); END;
CREATE TRIGGER IF NOT EXISTS trg_brigade_evidence_no_edit
BEFORE UPDATE ON brigade_evidence_images
BEGIN SELECT RAISE(ABORT,'Evidencia inmutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_brigade_evidence_no_delete
BEFORE DELETE ON brigade_evidence_images
BEGIN SELECT RAISE(ABORT,'No se borra evidencia histórica'); END;
