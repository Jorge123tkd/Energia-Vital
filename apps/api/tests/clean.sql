-- Limpiar datos de prueba del asistente (dejar la BD limpia)
DELETE FROM assistant_messages;
DELETE FROM assistant_sessions;
-- Orden importante: borrar hijos antes que padres (FK products.category_id).
DELETE FROM products WHERE id = 'prod-test-1';
DELETE FROM frequently_asked_questions WHERE id IN ('faq-test-1', 'faq-test-mantenimiento');
DELETE FROM categories WHERE id = 'cat-test-1';
DELETE FROM assistant_config WHERE key = 'business_name' OR id = 'cfg-test-1';
SELECT 'LIMPIO' AS check_name,
  (SELECT COUNT(*) FROM assistant_sessions) AS sesiones,
  (SELECT COUNT(*) FROM assistant_messages) AS mensajes,
  (SELECT COUNT(*) FROM products) AS productos,
  (SELECT COUNT(*) FROM frequently_asked_questions) AS faqs,
  (SELECT COUNT(*) FROM assistant_config) AS configs;
