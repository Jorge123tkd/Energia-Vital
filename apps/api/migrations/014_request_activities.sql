-- Bonaire Expediente 360°, fase 2A. Migración estrictamente aditiva.
-- NO copiar clientes/solicitudes/citas, NO rellenar datos ficticios.
-- Cada gestión pertenece a UNA solicitud real y UNA cuenta de personal.
-- Un gestor NO modifica ni borra actuaciones de otros: historial inmutable.
CREATE TABLE IF NOT EXISTS request_activities (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  activity_type TEXT NOT NULL
    CHECK(activity_type IN ('call','whatsapp','visit','follow_up','internal_note')),
  note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 1500),
  next_step TEXT CHECK(next_step IS NULL OR length(trim(next_step))<=280),
  follow_up_date TEXT CHECK(follow_up_date IS NULL OR follow_up_date
    GLOB '2[0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_activities_request
  ON request_activities(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_activities_actor
  ON request_activities(actor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_activities_due
  ON request_activities(follow_up_date)
  WHERE follow_up_date IS NOT NULL;
