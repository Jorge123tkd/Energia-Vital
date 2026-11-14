-- Gestión visual de servicios: fotografía principal almacenada en Cloudflare R2.
-- La galería y las imágenes de productos ya tienen sus propias tablas en 001.
ALTER TABLE services ADD COLUMN image_url TEXT;
ALTER TABLE services ADD COLUMN image_r2_key TEXT;
