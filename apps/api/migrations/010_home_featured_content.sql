-- Existing content remains published; administrators explicitly choose home highlights.
ALTER TABLE services ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1));
ALTER TABLE work_gallery ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1));
CREATE INDEX idx_services_featured ON services(is_active, is_featured, sort_order);
CREATE INDEX idx_gallery_featured ON work_gallery(is_active, is_featured, sort_order);
