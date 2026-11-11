import { Hono } from 'hono';
import type { Env } from '../types';

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get('/products', async c => {
  const category = c.req.query('category_id'), search = c.req.query('search'), featured = c.req.query('featured');
  let sql = `SELECT p.*, cat.name AS category_name, cat.slug AS category_slug,
    (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS primary_image_url
    FROM products p
    LEFT JOIN categories cat ON p.category_id = cat.id WHERE p.is_active = 1`;
  const params: string[] = [];
  if (category) { sql += ' AND p.category_id = ?'; params.push(category); }
  if (featured === 'true') sql += ' AND p.is_featured = 1';
  if (search) { sql += ' AND (p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ?)';
    const match = `%${search.slice(0, 100)}%`; params.push(match, match, match); }
  sql += ' ORDER BY p.sort_order, p.created_at DESC LIMIT 200';
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ products: results ?? [] });
});
// R2 se sirve por identificador de imagen; no se expone el nombre del objeto.
publicRoutes.get('/products/image/:id', async c => {
  const row = await c.env.DB.prepare(`SELECT pi.r2_key FROM product_images pi
    JOIN products p ON p.id = pi.product_id WHERE pi.id = ? AND p.is_active = 1`)
    .bind(c.req.param('id')).first<{ r2_key: string }>();
  if (!row?.r2_key) return c.notFound();
  const object = await c.env.BUCKET.get(row.r2_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});
publicRoutes.get('/products/:id', async c => {
  const product = await c.env.DB.prepare(`SELECT p.*, cat.name AS category_name FROM products p
    LEFT JOIN categories cat ON p.category_id = cat.id WHERE p.id = ? AND p.is_active = 1`).bind(c.req.param('id')).first();
  if (!product) return c.notFound();
  const { results } = await c.env.DB.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').bind(c.req.param('id')).all();
  return c.json({ product, images: results ?? [] });
});
publicRoutes.get('/categories', async c => {
  const { results } = await c.env.DB.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order LIMIT 200').all();
  return c.json({ categories: results ?? [] });
});
publicRoutes.get('/services', async c => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM services WHERE is_active = 1 ${c.req.query('featured') === 'true' ? 'AND is_featured = 1' : ''} ORDER BY sort_order, id LIMIT 200`).all();
  return c.json({ services: results ?? [] });
});
publicRoutes.get('/services/image/:id', async c => {
  const service = await c.env.DB.prepare('SELECT image_r2_key FROM services WHERE id = ? AND is_active = 1')
    .bind(c.req.param('id')).first<{ image_r2_key: string | null }>();
  if (!service?.image_r2_key) return c.notFound();
  const object = await c.env.BUCKET.get(service.image_r2_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});
publicRoutes.get('/services/:id', async c => {
  const service = await c.env.DB.prepare('SELECT * FROM services WHERE id = ? AND is_active = 1').bind(c.req.param('id')).first();
  return service ? c.json({ service }) : c.notFound();
});
publicRoutes.get('/faq', async c => {
  const category = c.req.query('category_id');
  const query = category ? 'SELECT * FROM frequently_asked_questions WHERE is_active = 1 AND (category_id = ? OR category_id IS NULL) ORDER BY sort_order LIMIT 100'
    : 'SELECT * FROM frequently_asked_questions WHERE is_active = 1 ORDER BY sort_order LIMIT 100';
  const prepared = c.env.DB.prepare(query);
  const { results } = await (category ? prepared.bind(category) : prepared).all();
  return c.json({ faqs: results ?? [] });
});
// Imágenes sin datos personales: acceso desde <img>, que no envía Authorization.
publicRoutes.get('/gallery/image/:key', async c => {
  const key = decodeURIComponent(c.req.param('key'));
  if (!key.startsWith('gallery/') || key.includes('..')) return c.notFound();
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});
publicRoutes.get('/site/media/:id', async c => {
  const record = await c.env.DB.prepare('SELECT r2_key FROM site_media WHERE id = ?')
    .bind(c.req.param('id')).first<{ r2_key: string }>();
  if (!record) return c.notFound();
  const object = await c.env.BUCKET.get(record.r2_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});
publicRoutes.get('/gallery/media/:id', async c => {
  const record = await c.env.DB.prepare('SELECT r2_key FROM work_gallery WHERE id = ? AND is_active = 1')
    .bind(c.req.param('id')).first<{ r2_key: string | null }>();
  if (!record?.r2_key) return c.notFound();
  const object = await c.env.BUCKET.get(record.r2_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});
publicRoutes.get('/gallery', async c => {
  const { results } = await c.env.DB.prepare(`SELECT w.*, (SELECT COUNT(*) FROM work_gallery_images im WHERE im.project_id=w.id) AS image_count FROM work_gallery w WHERE w.is_active = 1 ${c.req.query('featured') === 'true' ? 'AND w.is_featured = 1' : ''} ORDER BY w.sort_order, w.id LIMIT 200`).all();
  return c.json({ gallery: results ?? [] });
});
// Solo configuración comercial publicada; nunca claves internas ni datos privados.
const publicSettingKeys = ['youtube_channel_url', 'facebook_url', 'instagram_url', 'business_phone',
  'business_phones', 'business_email', 'business_address', 'business_hours', 'telegram_public_url',
  'bot_whatsapp_url', 'bot_telegram_url',
  'home_title', 'home_subtitle', 'home_slides', 'footer_description', 'footer_links',
  'footer_cta_title', 'footer_cta_description'];
publicRoutes.get('/settings', async c => {
  const marks = publicSettingKeys.map(() => '?').join(', ');
  const { results } = await c.env.DB.prepare(`SELECT key, value FROM system_settings WHERE key IN (${marks})`).bind(...publicSettingKeys).all<{key:string;value:string}>();
  return c.json({ settings: Object.fromEntries((results || []).map(r => [r.key,r.value])) });
});
