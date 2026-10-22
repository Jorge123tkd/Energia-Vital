-- Verificación de integridad referencial y de conteos
PRAGMA foreign_key_check;
SELECT 'ORPHANS' AS check_name, COUNT(*) AS orphans FROM assistant_messages m
  LEFT JOIN assistant_sessions s ON s.id = m.session_id WHERE s.id IS NULL;
SELECT 'COUNTS' AS check_name,
  (SELECT COUNT(*) FROM assistant_sessions) AS sesiones,
  (SELECT COUNT(*) FROM assistant_messages) AS mensajes,
  (SELECT COUNT(*) FROM assistant_messages WHERE role='user') AS de_usuario,
  (SELECT COUNT(*) FROM assistant_messages WHERE role='assistant') AS del_asistente;
SELECT 'SIN_RESPUESTA' AS check_name, COUNT(*) AS sesiones_sin_respuesta
  FROM assistant_sessions s
  WHERE NOT EXISTS (SELECT 1 FROM assistant_messages m WHERE m.session_id = s.id AND m.role='assistant');
