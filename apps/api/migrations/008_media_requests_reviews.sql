-- Bonaire: galería multiimagen, clasificaciones editables, evidencia adjunta y reseñas verificadas.
-- Diseñada para preservar las filas y fotografías existentes.
CREATE TABLE IF NOT EXISTS project_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO project_categories (id, name, created_at)
SELECT lower(hex(randomblob(16))), TRIM(category), datetime('now') FROM work_gallery
WHERE category IS NOT NULL AND TRIM(category) <> '' GROUP BY TRIM(category);

CREATE TABLE IF NOT EXISTS work_gallery_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES work_gallery(id) ON DELETE CASCADE,
  r2_key TEXT,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gallery_images_project ON work_gallery_images(project_id, sort_order);
INSERT OR IGNORE INTO work_gallery_images (id, project_id, r2_key, url, sort_order)
SELECT lower(hex(randomblob(16))), id, r2_key, url, 0
FROM work_gallery WHERE url IS NOT NULL AND TRIM(url) <> '';

CREATE TABLE IF NOT EXISTS service_images (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  r2_key TEXT,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_service_images_service ON service_images(service_id, sort_order);
INSERT OR IGNORE INTO service_images (id, service_id, r2_key, url, sort_order)
SELECT lower(hex(randomblob(16))), id, image_r2_key, image_url, 0
FROM services WHERE image_url IS NOT NULL AND TRIM(image_url) <> '';

CREATE TABLE IF NOT EXISTS request_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  legacy_type TEXT NOT NULL DEFAULT 'consultation'
    CHECK (legacy_type IN ('installation','maintenance','repair','consultation','complaint','suggestion')),
  requires_image INTEGER NOT NULL DEFAULT 0 CHECK (requires_image IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO request_categories (id,name,legacy_type,requires_image,sort_order) VALUES
('consultation','Consulta sobre equipos','consultation',0,0),
('installation','Instalación solar','installation',0,1),
('repair','Reparación','repair',1,2),
('maintenance','Mantenimiento','maintenance',1,3),
('complaint','Reclamación','complaint',1,4),
('suggestion','Sugerencia','suggestion',0,5);

ALTER TABLE requests ADD COLUMN request_category_id TEXT;
UPDATE requests SET request_category_id = type WHERE request_category_id IS NULL;

CREATE TABLE IF NOT EXISTS request_images (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_request_images_request ON request_images(request_id);

-- Una reseña auténtica requiere una compra comprobada por el equipo.
CREATE TABLE IF NOT EXISTS verified_product_purchases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  verified_by TEXT NOT NULL REFERENCES admin_users(id),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, customer_id)
);
CREATE TABLE IF NOT EXISTS product_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product_public ON product_reviews(product_id,status);
