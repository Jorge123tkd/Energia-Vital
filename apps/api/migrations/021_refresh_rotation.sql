-- Etapa 2/7: transición aditiva a refresh JWT de un solo uso por sesión.
-- Nullable para sesiones históricas: su primer refresh exitoso reclama la fila.
-- No aplicar a D1 de producción sin inventario, respaldo y autorización.
ALTER TABLE auth_sessions ADD COLUMN refresh_hash TEXT;
