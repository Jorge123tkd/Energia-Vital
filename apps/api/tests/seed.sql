-- Datos de prueba local (idempotente)
-- Orden importante: primero la categoria, luego los productos y FAQ que la referencian.
DELETE FROM products WHERE id = 'prod-test-1';
DELETE FROM frequently_asked_questions WHERE id IN ('faq-test-1', 'faq-test-mantenimiento');
DELETE FROM categories WHERE id = 'cat-test-1';

INSERT INTO categories (id, name, slug, description, is_active, sort_order, created_at, updated_at)
VALUES ('cat-test-1', 'Paneles Solares', 'paneles-solares', 'Paneles fotovoltaicos', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO products (id, category_id, name, slug, price, currency, stock_status, is_featured, is_active, sort_order, created_at, updated_at)
VALUES ('prod-test-1', 'cat-test-1', 'Panel Solar 550W', 'panel-solar-550w', 189.99, 'USD', 'in_stock', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

INSERT INTO frequently_asked_questions (id, category_id, question, answer, is_active, sort_order, created_at, updated_at)
VALUES ('faq-test-1', 'cat-test-1', 'Como funciona la garantia de los paneles solares?', 'Todos los paneles tienen 2 anos de garantia de fabrica y 5 anos de potencia.', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
       ('faq-test-mantenimiento', NULL, 'Cada cuanto se debe hacer mantenimiento de los paneles solares?', 'Recomendamos una revision preventiva al menos una vez al ano.', 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Se borra por key (y no por id) porque assistant_config.key es UNIQUE y la
-- seed de produccion puede haber definido la misma clave con otro id.
DELETE FROM assistant_config WHERE key = 'business_name' OR id = 'cfg-test-1';
INSERT INTO assistant_config (id, key, value, description, updated_at)
VALUES ('cfg-test-1', 'business_name', 'Energía Vital', 'Nombre comercial', '2026-01-01T00:00:00.000Z');

SELECT 'SEED_OK' AS check_name, (SELECT COUNT(*) FROM products) AS productos,
       (SELECT COUNT(*) FROM frequently_asked_questions) AS faqs,
       (SELECT COUNT(*) FROM assistant_config) AS configs;
