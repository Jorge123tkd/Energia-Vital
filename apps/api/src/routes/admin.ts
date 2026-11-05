import { Hono } from 'hono';
import { Env } from '../types';
import { requireAdminAuth } from '../middleware';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

// Middleware de autenticación
adminRoutes.use('*', requireAdminAuth);

// --- LISTAR USUARIOS (admin) ---
adminRoutes.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, role, telegram_username, telegram_chat_id, is_active, created_at FROM admin_users ORDER BY created_at DESC'
  ).all<any>();
  return c.json({ users: results ?? [] });
});

// --- CREAR USUARIO (admin) ---
adminRoutes.post('/users', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  if (!b.email || !b.password) return c.json({ error: 'email y password son requeridos' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await import('../auth').then(m => m.hashPassword(b.password));
  await DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role, is_active, telegram_chat_id, telegram_username, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, b.email.toLowerCase(), passwordHash, b.role || 'admin', b.is_active ? 1 : 0, b.telegram_chat_id || null, b.telegram_username || null, now, now).run();
  return c.json({ id, message: 'Usuario creado' });
});

// --- ACTUALIZAR USUARIO (admin) ---
adminRoutes.patch('/users/:id', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (b.role !== undefined) { sets.push(`role = ?`); params.push(b.role); }
  if (b.is_active !== undefined) { sets.push(`is_active = ?`); params.push(b.is_active ? 1 : 0); }
  if (b.telegram_chat_id !== undefined) { sets.push(`telegram_chat_id = ?`); params.push(b.telegram_chat_id || null); }
  if (b.telegram_username !== undefined) { sets.push(`telegram_username = ?`); params.push(b.telegram_username || null); }
  if (sets.length === 0) return c.json({ error: 'No hay campos para actualizar' }, 400);

  params.push(now, c.req.param('id'));
  await DB.prepare(`UPDATE admin_users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...params).run();
  return c.json({ message: 'Usuario actualizado' });
});

// --- ELIMINAR USUARIO (admin) ---
adminRoutes.delete('/users/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Usuario eliminado' });
});

// --- CONFIGURACIÓN DEL SISTEMA (admin) : ya existe ---
// --- AUDITORÍA (admin): ya existe ---

// --- GESTIÓN DE SORTEOS (admin) ---
adminRoutes.get('/gives', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM giveaways ORDER BY created_at DESC').all<any>();
  return c.json({ giveaways: results ?? [] });
});

adminRoutes.post('/gives', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  if (!b.title || !b.prize || !b.start_date || !b.end_date) return c.json({ error: 'title, prize, start_date y end_date son requeridos' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO giveaways (id, title, description, prize, prize_image_url, entry_type, requires_email, requires_phone, requires_telegram, start_date, end_date, max_participants, max_winner_entries, num_winners, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, b.title, b.description || null, b.prize, b.prize_image_url || null, b.entry_type || 'any', b.requires_email ? 1 : 0, b.requires_phone ? 1 : 0, b.requires_telegram ? 1 : 0, b.start_date, b.end_date, b.max_participants || null, b.max_winner_entries || 1, b.num_winners || 1, b.status || 'draft', c.req.header('x-admin-user-id') || 'admin', now, now).run();
  return c.json({ id, message: 'Sorteo creado' });
});

// --- GESTIÓN DE RECOMPENSAS (admin) ---
adminRoutes.get('/rewards', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM reward_catalog ORDER BY name ASC').all<any>();
  return c.json({ rewards: results ?? [] });
});

adminRoutes.post('/rewards', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  if (!b.name || !b.cost || b.cost < 0) return c.json({ error: 'name y cost (>=0) son requeridos' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO reward_catalog (id, name, description, cost, stock_quantity, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(id, b.name, b.description || null, b.cost, b.stock_quantity || null, now, now).run();
  return c.json({ id, message: 'Recompensa creada' });
});

// --- GESTIÓN DE CLIENTES (admin) ---
adminRoutes.get('/customers', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, email, phone, role, phone_verified, telegram_username, telegram_chat_id, created_at FROM customers ORDER BY created_at DESC'
  ).all<any>();
  return c.json({ customers: results ?? [] });
});

// --- NOTIFICACIONES (admin) ---
adminRoutes.get('/notifications', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT n.*, u.name as customer_name, u.email, u.phone FROM notifications n
     LEFT JOIN customers u ON n.user_id = u.id
     WHERE n.user_type = 'customer' ORDER BY n.created_at DESC LIMIT 100`
  ).all<any>();
  return c.json({ notifications: results ?? [] });
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

adminRoutes.patch('/categories/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  await DB.prepare(
    'UPDATE categories SET name = COALESCE(?, name), slug = COALESCE(?, slug), description = COALESCE(?, description), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE id = ?'
  ).bind(b.name || null, b.slug || null, b.description || null, b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, b.sort_order !== undefined ? b.sort_order : null, now, id).run();
  return c.json({ message: 'Categoría actualizada' });
});

adminRoutes.delete('/categories/:id', async (c) => {
  const { DB } = c.env;
  await DB.prepare('DELETE FROM categories WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Categoría eliminada' });
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

adminRoutes.patch('/services/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  await DB.prepare(
    'UPDATE services SET name = COALESCE(?, name), slug = COALESCE(?, slug), description = COALESCE(?, description), scope = COALESCE(?, scope), price = COALESCE(?, price), price_type = COALESCE(?, price_type), duration_minutes = COALESCE(?, duration_minutes), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE id = ?'
  ).bind(
    b.name || null, b.slug || null, b.description || null, b.scope || null,
    b.price !== undefined ? b.price : null, b.price_type || null, b.duration_minutes !== undefined ? b.duration_minutes : null,
    b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, b.sort_order !== undefined ? b.sort_order : null,
    now, id
  ).run();
  return c.json({ message: 'Servicio actualizado' });
});

adminRoutes.delete('/services/:id', async (c) => {
  const { DB } = c.env;
  await DB.prepare('DELETE FROM services WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Servicio eliminado' });
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

adminRoutes.patch('/faq/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  await DB.prepare(
    'UPDATE frequently_asked_questions SET category_id = COALESCE(?, category_id), question = COALESCE(?, question), answer = COALESCE(?, answer), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order), updated_at = ? WHERE id = ?'
  ).bind(b.category_id || null, b.question || null, b.answer || null, b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, b.sort_order !== undefined ? b.sort_order : null, now, id).run();
  return c.json({ message: 'FAQ actualizada' });
});

adminRoutes.delete('/faq/:id', async (c) => {
  const { DB } = c.env;
  await DB.prepare('DELETE FROM frequently_asked_questions WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'FAQ eliminada' });
});

// --- GALERÍA ---
adminRoutes.get('/gallery', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM work_gallery ORDER BY sort_order ASC').all();
  return c.json({ gallery: results ?? [] });
});

adminRoutes.post('/gallery', async (c) => {
  const { DB, BUCKET } = c.env;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let title: string | null = null;
  let description: string | null = null;
  let url: string | null = null;
  let r2_key: string | null = null;
  let video_url: string | null = null;
  let category: string | null = null;
  let is_active = true;
  let sort_order = 0;

  // Soporta multipart/form-data (subida de archivo) o JSON (URL externa)
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    title = (formData.get('title') as string) || null;
    description = (formData.get('description') as string) || null;
    video_url = (formData.get('video_url') as string) || null;
    category = (formData.get('category') as string) || null;
    const isActiveRaw = formData.get('is_active');
    if (isActiveRaw !== null) is_active = isActiveRaw === 'true' || isActiveRaw === '1';
    const sortRaw = formData.get('sort_order');
    if (sortRaw !== null) sort_order = Number(sortRaw) || 0;

    const file = formData.get('file') as File | null;
    if (file && file.size > 0) {
      const key = `gallery/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });
      r2_key = key;
      const origin = new URL(c.req.url).origin;
      url = `${origin}/api/public/gallery/image/${encodeURIComponent(key)}`;
    } else {
      url = (formData.get('url') as string) || null;
    }
  } else {
    const b = await c.req.json<any>();
    title = b.title ?? null;
    description = b.description ?? null;
    url = b.url ?? null;
    r2_key = b.r2_key ?? null;
    video_url = b.video_url ?? null;
    category = b.category ?? null;
    is_active = b.is_active !== false;
    sort_order = b.sort_order || 0;
  }

  await DB.prepare(
    'INSERT INTO work_gallery (id, title, description, url, r2_key, video_url, category, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, title, description, url, r2_key, video_url,
    category, is_active ? 1 : 0, sort_order, now, now
  ).run();

  return c.json({ id, message: 'Imagen de galería creada', url, r2_key });
});

adminRoutes.delete('/gallery/:id', async (c) => {
  const { DB, BUCKET } = c.env;
  const id = c.req.param('id');
  const row = await DB.prepare('SELECT r2_key FROM work_gallery WHERE id = ?').bind(id).first<{ r2_key: string | null }>();
  if (row?.r2_key) {
    try { await BUCKET.delete(row.r2_key); } catch (e) { console.error('Error borrando de R2:', e); }
  }
  await DB.prepare('DELETE FROM work_gallery WHERE id = ?').bind(id).run();
  return c.json({ message: 'Imagen de galería eliminada' });
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

adminRoutes.delete('/settings/:id', async (c) => {
  const { DB } = c.env;
  await DB.prepare('DELETE FROM system_settings WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Configuración eliminada' });
});