import { Hono } from 'hono';
import { Env } from '../types';

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Middleware de autenticación
adminRoutes.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }
  await next();
});

// --- PRODUCTOS ---
adminRoutes.get('/products', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM products ORDER BY sort_order ASC').all();
  return c.json({ products: results ?? [] });
});

adminRoutes.post('/products', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO products (id, category_id, name, slug, brand, model, description, short_description, price, currency, stock_quantity, stock_status, specifications, warranty_months, compatibility, purchase_url, is_featured, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, b.category_id, b.name, b.slug, b.brand || null, b.model || null, b.description || null,
    b.short_description || null, b.price || null, b.currency || 'USD', b.stock_quantity || null,
    b.stock_status || 'in_stock', b.specifications || null, b.warranty_months || null,
    b.compatibility || null, b.purchase_url || null, b.is_featured ? 1 : 0, b.is_active !== false ? 1 : 0,
    b.sort_order || 0, now, now
  ).run();
  return c.json({ id, message: 'Producto creado' });
});

adminRoutes.patch('/products/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  await DB.prepare(
    'UPDATE products SET name = COALESCE(?, name), price = COALESCE(?, price), stock_status = COALESCE(?, stock_status), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?'
  ).bind(b.name || null, b.price || null, b.stock_status || null, b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, now, id).run();
  return c.json({ message: 'Producto actualizado' });
});

adminRoutes.delete('/products/:id', async (c) => {
  const { DB } = c.env;
  await DB.prepare('DELETE FROM products WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Producto eliminado' });
});

// --- CATEGORÍAS ---
adminRoutes.get('/categories', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  return c.json({ categories: results ?? [] });
});

adminRoutes.post('/categories', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO categories (id, name, slug, description, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, b.name, b.slug, b.description || null, 1, b.sort_order || 0, now, now).run();
  return c.json({ id, message: 'Categoría creada' });
});

// --- SERVICIOS ---
adminRoutes.get('/services', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM services ORDER BY sort_order ASC').all();
  return c.json({ services: results ?? [] });
});

adminRoutes.post('/services', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO services (id, name, slug, description, scope, price, price_type, duration_minutes, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, b.name, b.slug, b.description || null, b.scope || null, b.price || null, b.price_type || 'quote', b.duration_minutes || null, 1, b.sort_order || 0, now, now).run();
  return c.json({ id, message: 'Servicio creado' });
});

// --- PREGUNTAS FRECUENTES (FAQ) ---
adminRoutes.get('/faq', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM frequently_asked_questions ORDER BY sort_order ASC').all();
  return c.json({ faqs: results ?? [] });
});

adminRoutes.post('/faq', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO frequently_asked_questions (id, category_id, question, answer, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, b.category_id || null, b.question, b.answer, 1, b.sort_order || 0, now, now).run();
  return c.json({ id, message: 'FAQ creada' });
});

// --- GALERÍA ---
adminRoutes.get('/gallery', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM work_gallery ORDER BY sort_order ASC').all();
  return c.json({ gallery: results ?? [] });
});

// --- CONFIGURACIÓN DEL ASISTENTE ---
adminRoutes.get('/assistant-config', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM assistant_config ORDER BY key ASC').all();
  return c.json({ config: results ?? [] });
});

adminRoutes.post('/assistant-config', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO assistant_config (id, key, value, description, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, b.key, b.value, b.description || null, now).run();
  return c.json({ id, message: 'Configuración guardada' });
});

// --- CONFIGURACIÓN DEL SISTEMA ---
adminRoutes.get('/settings', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM system_settings ORDER BY key ASC').all();
  return c.json({ settings: results ?? [] });
});

adminRoutes.post('/settings', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO system_settings (id, key, value, description, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, b.key, b.value, b.description || null, now).run();
  return c.json({ id, message: 'Configuración del sistema guardada' });
});

// --- AUDITORÍA ---
adminRoutes.get('/audit', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  return c.json({ logs: results ?? [] });
});