-- Bloqueo administrativo de cuentas sin borrar datos comerciales.
-- DEFAULT 1 mantiene el acceso de las cuentas actuales.
ALTER TABLE customers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
