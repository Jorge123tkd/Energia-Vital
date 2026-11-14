-- Bonaire: brigadas y planificación técnica, primera entrega ADITIVA.
-- NO crea brigadas ficticias, ni altera solicitudes/citas existentes.
-- Aplicar SOLO tras respaldo y pruebas de migración en D1 local.
CREATE TABLE IF NOT EXISTS brigades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 3 AND 120),
  leader_name TEXT NOT NULL CHECK(length(trim(leader_name)) BETWEEN 3 AND 120),
  specialty TEXT CHECK(specialty IS NULL OR length(specialty)<=300),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT REFERENCES admin_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brigade_members (
  id TEXT PRIMARY KEY,
  brigade_id TEXT NOT NULL REFERENCES brigades(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 3 AND 120),
  function_name TEXT CHECK(function_name IS NULL OR length(function_name)<=100),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brigade_members_brigade ON brigade_members(brigade_id, is_active);

-- Una fila equivale a UN trabajo de UNA brigada en UN día local de Cuba.
-- Una solicitud de varios días puede tener varias filas de fechas diferentes.
-- Los trabajos no se insertan desde clientes ni desde el bot.
CREATE TABLE IF NOT EXISTS brigade_work (
  id TEXT PRIMARY KEY,
  brigade_id TEXT NOT NULL REFERENCES brigades(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 180),
  work_date TEXT NOT NULL CHECK(work_date GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  estimated_minutes INTEGER NOT NULL DEFAULT 480 CHECK(estimated_minutes BETWEEN 30 AND 1440),
  status TEXT NOT NULL CHECK(status IN ('scheduled','pending_approval','rejected','cancelled','completed')),
  busy_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(busy_acknowledged IN (0,1)),
  requested_by TEXT NOT NULL REFERENCES admin_users(id),
  reviewed_by TEXT REFERENCES admin_users(id),
  reviewed_at TEXT,
  review_reason TEXT CHECK(review_reason IS NULL OR length(review_reason)<=500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brigade_work_day ON brigade_work(brigade_id,work_date,status);
CREATE INDEX IF NOT EXISTS idx_brigade_work_request ON brigade_work(request_id,work_date);
CREATE INDEX IF NOT EXISTS idx_brigade_work_approvals ON brigade_work(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brigade_work_no_duplicate
  ON brigade_work(brigade_id,request_id,work_date)
  WHERE status IN ('scheduled','pending_approval','completed');

-- Defensa en profundidad: incluso si un endpoint falla, D1 bloquea la segunda
-- asignación directa sin autorización cuando hay TRES O MÁS brigadas activas.
-- Con una o dos brigadas se exige reconocimiento explícito de ocupación.
CREATE TRIGGER IF NOT EXISTS trg_brigade_work_guard_insert
BEFORE INSERT ON brigade_work
WHEN NEW.status = 'scheduled'
 AND EXISTS (
   SELECT 1 FROM brigade_work w
   WHERE w.brigade_id=NEW.brigade_id AND w.work_date=NEW.work_date
     AND w.status IN ('scheduled','pending_approval','completed')
 )
 AND (
   (SELECT COUNT(*) FROM brigades WHERE is_active=1)>2
   OR NEW.busy_acknowledged<>1
 )
BEGIN
  SELECT RAISE(ABORT,'La brigada tiene ocupación; revisar autorización o confirmación');
END;

-- Un permiso general solo es válido si lo registra un administrador principal
-- ACTIVO; no basta con que el operador coloque su propio ID como aprobador.
CREATE TRIGGER IF NOT EXISTS trg_brigade_work_guard_approval
BEFORE UPDATE OF status ON brigade_work
WHEN NEW.status='scheduled' AND OLD.status<>'scheduled'
 AND (
   OLD.status='pending_approval'
   OR (
     (SELECT COUNT(*) FROM brigades WHERE is_active=1)>2
     AND EXISTS (
       SELECT 1 FROM brigade_work w
       WHERE w.id<>OLD.id AND w.brigade_id=NEW.brigade_id
         AND w.work_date=NEW.work_date
         AND w.status IN ('scheduled','pending_approval','completed')
     )
   )
 )
 AND NOT EXISTS (
   SELECT 1 FROM admin_users a
   WHERE a.id=NEW.reviewed_by AND a.role='admin' AND a.is_active=1
 )
BEGIN
  SELECT RAISE(ABORT,'La segunda asignación requiere administrador general activo');
END;

-- No mover silenciosamente una asignación a otra brigada, solicitud o día:
-- cancelar y crear otra conserva la historia y obliga a revisar el nuevo día.
CREATE TRIGGER IF NOT EXISTS trg_brigade_work_immutable_target
BEFORE UPDATE OF brigade_id, request_id, work_date ON brigade_work
WHEN NEW.brigade_id<>OLD.brigade_id
  OR NEW.request_id<>OLD.request_id
  OR NEW.work_date<>OLD.work_date
BEGIN
  SELECT RAISE(ABORT,'Para reprogramar, cancela la asignación y crea una nueva');
END;
