-- ============================================================================
-- Contenido base de produccion (idempotente).
-- NO inventa precios ni productos: el catalogo real se carga desde el panel
-- de administracion (/admin). Aqui solo se siembra la configuracion del
-- asistente y las FAQ generales del negocio.
-- ============================================================================

-- Configuracion del asistente
DELETE FROM assistant_config WHERE key IN ('business_name', 'welcome_message', 'company_hours', 'contact_phone', 'contact_email');
INSERT INTO assistant_config (id, key, value, description, updated_at) VALUES
  ('cfg-business-name', 'business_name', 'Energía Vital', 'Nombre comercial del negocio', datetime('now')),
  ('cfg-welcome', 'welcome_message', '¡Hola! Soy el asistente de Energía Vital. ¿En qué puedo ayudarte hoy?

Puedo ayudarte con:
- Equipos solares (inversores, paneles, baterías)
- Precios y disponibilidad del catálogo
- Citas de instalación, mantenimiento o reparación
- Dudas frecuentes sobre nuestros servicios

¿Qué necesitas?', 'Mensaje de bienvenida del asistente', datetime('now')),
  ('cfg-hours', 'company_hours', 'Lunes a viernes de 8:00 a 18:00, sábados de 9:00 a 13:00', 'Horario de atención', datetime('now'));

-- FAQ generales del negocio
DELETE FROM frequently_asked_questions WHERE id IN ('faq-prod-horario', 'faq-prod-area', 'faq-prod-mantenimiento', 'faq-prod-instalacion');
INSERT INTO frequently_asked_questions (id, category_id, question, answer, is_active, sort_order, created_at, updated_at) VALUES
  ('faq-prod-horario', NULL, '¿Cuál es el horario de atención?', 'Nuestro horario de atención es de lunes a viernes de 8:00 a 18:00 y los sábados de 9:00 a 13:00. También puedes dejar tu consulta en cualquier momento por este chat y te responderemos a la brevedad.', 1, 0, datetime('now'), datetime('now')),
  ('faq-prod-area', NULL, '¿En qué áreas instalan sistemas solares?', 'Realizamos instalaciones residenciales, comerciales e industriales. Para confirmar la cobertura de tu zona y las condiciones de instalación, coordinamos una visita técnica sin costo.', 1, 1, datetime('now'), datetime('now')),
  ('faq-prod-mantenimiento', NULL, '¿Cada cuánto se debe dar mantenimiento a los paneles solares?', 'Recomendamos una revisión preventiva al menos una vez al año, y limpieza según el nivel de polvo y suciedad de la zona. El mantenimiento mantiene la producción estable y prolonga la vida útil del sistema.', 1, 2, datetime('now'), datetime('now')),
  ('faq-prod-instalacion', NULL, '¿Cómo es el proceso de instalación?', 'El proceso consta de cuatro pasos: 1) contacto y asesoría inicial, 2) visita técnica y dimensionamiento del sistema, 3) propuesta económica con el equipo recomendado, y 4) instalación, puesta en marcha y capacitación de uso.', 1, 3, datetime('now'), datetime('now'));

SELECT 'SEED_PROD_OK' AS check_name,
  (SELECT COUNT(*) FROM assistant_config) AS configs,
  (SELECT COUNT(*) FROM frequently_asked_questions) AS faqs,
  (SELECT COUNT(*) FROM products) AS productos,
  (SELECT COUNT(*) FROM categories) AS categorias;
