-- Imágenes subidas directamente por administración para el carrusel de Bonaire.
-- No altera ni borra registros comerciales existentes.
CREATE TABLE IF NOT EXISTS site_media (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_media_created_at ON site_media(created_at);
