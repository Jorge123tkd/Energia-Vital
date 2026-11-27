-- Bonaire: seguridad de roles. No permite eliminar ni degradar al último
-- administrador activo. La restricción se comprueba DENTRO de la sentencia
-- SQLite, evitando la carrera entre SELECT COUNT(*) y UPDATE/DELETE.
-- La migración no modifica filas ni privilegios existentes. NO ejecutar
-- sobre D1 de producción sin inventario, respaldo y autorización.
CREATE TRIGGER IF NOT EXISTS trg_admin_users_keep_one_active_on_update
BEFORE UPDATE OF role, is_active ON admin_users
WHEN OLD.role='admin' AND OLD.is_active=1
 AND (NEW.role!='admin' OR NEW.is_active!=1)
 AND (SELECT COUNT(*) FROM admin_users WHERE role='admin' AND is_active=1)<=1
BEGIN
  SELECT RAISE(ABORT,'last_active_admin');
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_users_keep_one_active_on_delete
BEFORE DELETE ON admin_users
WHEN OLD.role='admin' AND OLD.is_active=1
 AND (SELECT COUNT(*) FROM admin_users WHERE role='admin' AND is_active=1)<=1
BEGIN
  SELECT RAISE(ABORT,'last_active_admin');
END;
