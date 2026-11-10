import { Hono } from 'hono';
import { Env } from '../types';
import { requireAdminAuth } from '../middleware';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

const cleanText = (value: unknown, max = 3000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nullableNumber = (value: unknown): number | null => value === null || value === undefined || value === '' ? null : Number(value);
const validPrice = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);
const mediaTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function uploadMedia(c: any, folder: 'products' | 'services', ownerId: string) {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 8 * 1024 * 1024 || !mediaTypes[file.type]) {
    return { error: 'Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.' } as const;
  }
  const buffer = await file.arrayBuffer();
  const b = new Uint8Array(buffer);
  const jpg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  const webp = b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  if (!(file.type === 'image/jpeg' && jpg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) {
    return { error: 'El archivo no coincide con un formato de imagen admitido.' } as const;
  }
  const id = crypto.randomUUID();
  const key = `${folder}/${ownerId}/${id}.${mediaTypes[file.type]}`;
  await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });
  return { key, id, alt: cleanText(form.get('alt_text'), 180) } as const;
}

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
  const { results } = await DB.prepare(`SELECT p.*, (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS primary_image_url FROM products p ORDER BY p.sort_order ASC`).all();
  return c.json({ products: results ?? [] });
});

adminRoutes.post('/products', async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const price = nullableNumber(b.price);
  if (!cleanText(b.name, 120) || !cleanText(b.category_id, 100) || !validPrice(price)) return c.json({ error: 'Nombre, categoría y precio válido son necesarios.' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO products (id, category_id, name, slug, brand, model, description, short_description, price, currency, stock_quantity, stock_status, specifications, warranty_months, compatibility, purchase_url, is_featured, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, b.category_id, b.name, b.slug, b.brand || null, b.model || null, b.description || null,
    b.short_description || null, price, b.currency || 'USD', nullableNumber(b.stock_quantity),
    b.stock_status || 'in_stock', b.specifications || null, b.warranty_months || null,
    b.compatibility || null, b.purchase_url || null, b.is_featured ? 1 : 0, b.is_active !== false ? 1 : 0,
    b.sort_order || 0, now, now
  ).run();
  return c.json({ id, message: 'Producto creado' });
});

adminRoutes.patch('/products/:id', async c => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<any>();
  if (!existing) return c.notFound();
  const b = await c.req.json<any>();
  const row = { ...existing, ...b };
  const name = cleanText(row.name, 120);
  const category = cleanText(row.category_id, 100);
  const price = nullableNumber(row.price);
  const quantity = nullableNumber(row.stock_quantity);
  if (!name || !category || !validPrice(price) || (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)))
    return c.json({ error: 'Revisa nombre, categoría, precio y existencias.' }, 400);
  if (!['in_stock', 'out_of_stock', 'on_order'].includes(row.stock_status)) return c.json({ error: 'Estado de inventario inválido.' }, 400);
  await c.env.DB.prepare(`UPDATE products SET category_id=?, name=?, brand=?, model=?, description=?, short_description=?, price=?, currency=?, stock_quantity=?, stock_status=?, specifications=?, warranty_months=?, compatibility=?, purchase_url=?, is_featured=?, is_active=?, updated_at=? WHERE id=?`)
    .bind(category, name, cleanText(row.brand, 120) || null, cleanText(row.model, 120) || null,
      cleanText(row.description, 5000) || null, cleanText(row.short_description, 400) || null,
      price, ['USD', 'CUP', 'MLC'].includes(row.currency) ? row.currency : 'USD', quantity,
      row.stock_status, cleanText(row.specifications, 3000) || null, nullableNumber(row.warranty_months),
      cleanText(row.compatibility, 2000) || null, cleanText(row.purchase_url, 400) || null,
      row.is_featured ? 1 : 0, row.is_active ? 1 : 0, new Date().toISOString(), id).run();
  return c.json({ message: 'Producto actualizado' });
});

adminRoutes.post('/products/:id/image', async c => {
  const id = c.req.param('id');
  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!product) return c.notFound();
  const uploaded = await uploadMedia(c, 'products', id);
  if ('error' in uploaded) return c.json({ error: uploaded.error }, 400);
  const url = `${new URL(c.req.url).origin}/api/public/products/image/${uploaded.id}`;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').bind(id),
      c.env.DB.prepare('INSERT INTO product_images (id, product_id, r2_key, url, alt_text, is_primary, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
        .bind(uploaded.id, id, uploaded.key, url, uploaded.alt || null, new Date().toISOString()),
    ]);
  } catch (e) {
    await c.env.BUCKET.delete(uploaded.key);
    throw e;
  }
  return c.json({ message: 'Foto añadida al producto', image_url: url }, 201);
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
  const price = nullableNumber(b.price);
  if (!cleanText(b.name, 120) || !validPrice(price) || !['fixed', 'quote', 'free'].includes(b.price_type || 'quote')) return c.json({ error: 'Revisa el nombre, precio y tipo de servicio.' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    'INSERT INTO services (id, name, slug, description, scope, price, price_type, duration_minutes, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, b.name, b.slug, b.description || null, b.scope || null, price, b.price_type || 'quote', b.duration_minutes || null, 1, b.sort_order || 0, now, now).run();
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

adminRoutes.post('/services/:id/image', async c => {
  const id = c.req.param('id');
  const service = await c.env.DB.prepare('SELECT image_r2_key FROM services WHERE id = ?').bind(id).first<{ image_r2_key: string | null }>();
  if (!service) return c.notFound();
  const uploaded = await uploadMedia(c, 'services', id);
  if ('error' in uploaded) return c.json({ error: uploaded.error }, 400);
  const url = `${new URL(c.req.url).origin}/api/public/services/image/${id}`;
  try {
    await c.env.DB.prepare('UPDATE services SET image_r2_key = ?, image_url = ?, updated_at = ? WHERE id = ?')
      .bind(uploaded.key, url, new Date().toISOString(), id).run();
  } catch (e) {
    await c.env.BUCKET.delete(uploaded.key);
    throw e;
  }
  if (service.image_r2_key) await c.env.BUCKET.delete(service.image_r2_key).catch(() => {});
  return c.json({ message: 'Foto del servicio actualizada', image_url: url }, 201);
});

adminRoutes.delete('/services/:id', async (c) => {
  const { DB } = c.env;
  const row = await DB.prepare('SELECT image_r2_key FROM services WHERE id = ?').bind(c.req.param('id')).first<{ image_r2_key: string | null }>();
  await DB.prepare('DELETE FROM services WHERE id = ?').bind(c.req.param('id')).run();
  if (row?.image_r2_key) await c.env.BUCKET.delete(row.image_r2_key).catch(() => {});
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
      url = `${origin}/api/public/gallery/media/${id}`;
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
    'INSERT INTO work_gallery (id, title, description, url, r2_key, video_url, category, is_active, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, title, description, url, r2_key, video_url,
    category, is_active ? 1 : 0, sort_order, now
  ).run();

  return c.json({ id, message: 'Imagen de galería creada', url, r2_key }, 201);
});

adminRoutes.patch('/gallery/:id', async c => {
  const id = c.req.param('id');
  const current = await c.env.DB.prepare('SELECT * FROM work_gallery WHERE id = ?').bind(id).first<any>();
  if (!current) return c.notFound();
  const b = await c.req.json<any>();
  await c.env.DB.prepare('UPDATE work_gallery SET title=?, description=?, category=?, video_url=?, is_active=?, sort_order=? WHERE id=?')
    .bind(cleanText(b.title ?? current.title, 160), cleanText(b.description ?? current.description, 2000) || null,
      cleanText(b.category ?? current.category, 120) || null, cleanText(b.video_url ?? current.video_url, 500) || null,
      (b.is_active ?? current.is_active) ? 1 : 0, Number(b.sort_order ?? current.sort_order) || 0, id).run();
  return c.json({ message: 'Galería actualizada' });
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

// Configuración pública editable sin exponer secretos ni aceptar HTML arbitrario.
const allowedSiteFields = ['home_title', 'home_subtitle', 'home_slides', 'footer_description', 'footer_links',
  'business_phone', 'business_email', 'business_address', 'business_hours',
  'youtube_channel_url', 'facebook_url', 'instagram_url', 'telegram_public_url'] as const;
adminRoutes.put('/site-settings', async c => {
  const b = await c.req.json<Record<string, unknown>>();
  const keys = Object.keys(b);
  if (keys.length === 0 || keys.some(k => !(allowedSiteFields as readonly string[]).includes(k)))
    return c.json({ error: 'Campos de configuración no permitidos.' }, 400);
  const records: Array<{ key: string; value: string }> = [];
  const socialKeys = new Set(['youtube_channel_url', 'facebook_url', 'instagram_url', 'telegram_public_url']);
  for (const key of keys) {
    if (typeof b[key] !== 'string' || (b[key] as string).length > (key === 'home_slides' ? 9000 : 3500))
      return c.json({ error: `Valor inválido en ${key}` }, 400);
    let value = (b[key] as string).trim();
    if (socialKeys.has(key) && value && !/^https:\/\/[^\s]+$/i.test(value))
      return c.json({ error: `Utiliza una dirección HTTPS válida en ${key}` }, 400);
    if (key === 'home_slides') {
      let slides: unknown;
      try { slides = JSON.parse(value); } catch {
        return c.json({ error: 'Configuración del carrusel inválida.' }, 400);
      }
      const isHttps = (address: string) => {
        try { const parsed = new URL(address); return parsed.protocol === 'https:' && Boolean(parsed.hostname); }
        catch { return false; }
      };
      const isSafeLink = (address: string) =>
        (address.startsWith('/') && !address.startsWith('//') && !address.includes('\\')) || isHttps(address);
      if (!Array.isArray(slides) || slides.length !== 3 || !slides.every((s: any) =>
        s && typeof s.title === 'string' && s.title.trim().length > 0 && s.title.length <= 120 &&
        typeof s.subtitle === 'string' && s.subtitle.length <= 450 &&
        typeof s.image_url === 'string' && s.image_url.length <= 600 &&
        (!s.image_url || isHttps(s.image_url)) &&
        typeof s.link_label === 'string' && s.link_label.length <= 60 &&
        typeof s.link_url === 'string' && s.link_url.length <= 500 &&
        isSafeLink(s.link_url))) {
        return c.json({ error: 'El carrusel necesita tres diapositivas válidas con enlaces seguros.' }, 400);
      }
      value = JSON.stringify(slides.map((s: any) => ({
        title: s.title.trim(), subtitle: s.subtitle.trim(), image_url: s.image_url.trim(),
        link_label: s.link_label.trim(), link_url: s.link_url.trim()
      })));
    }
    if (key === 'footer_links') {
      let links: unknown;
      try { links = JSON.parse(value || '[]'); } catch { return c.json({ error: 'Enlaces del footer inválidos.' }, 400); }
      if (!Array.isArray(links) || links.length > 12 || !links.every((l: any) =>
        l && typeof l.label === 'string' && l.label.trim().length > 0 && l.label.length <= 60 &&
        typeof l.url === 'string' && l.url.length <= 400 &&
        (/^\/(?!\/)[a-zA-Z0-9/_?=&.-]*$/.test(l.url) || /^https:\/\/[^\s]+$/i.test(l.url))))
        return c.json({ error: 'Cada enlace necesita nombre y una ruta interna o dirección HTTPS válida (máximo 12).' }, 400);
      value = JSON.stringify(links.map((l: any) => ({ label: l.label.trim(), url: l.url.trim() })));
    }
    records.push({ key, value });
  }
  await c.env.DB.batch(records.map(r => c.env.DB.prepare(
    `INSERT INTO system_settings (id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), r.key, r.value, new Date().toISOString())));
  return c.json({ message: 'Cambios publicados en el sitio.' });
});
