import { Hono } from 'hono';
import { Env } from '../types';

export const publicRoutes = new Hono<{ Bindings: Env }>();

// Catálogo de productos
publicRoutes.get('/products', async (c) => {
  const { DB } = c.env;
  const categoryId = c.req.query('category_id');
  const featured = c.req.query('featured');
  const search = c.req.query('search');

  let sql = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1
  `;
  const params: any[] = [];

  if (categoryId) {
    sql += ' AND p.category_id = ?';
    params.push(categoryId);
  }
  if (featured === 'true') {
    sql += ' AND p.is_featured = 1';
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.brand LIKE ? OR p.model LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY p.sort_order ASC, p.created_at DESC';

  const { results } = await DB.prepare(sql).bind(...params).all();
  return c.json({ products: results ?? [] });
});

// Detalle de producto
publicRoutes.get('/products/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  const product = await DB.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.is_active = 1
  `).bind(id).first();

  if (!product) return c.notFound();

  const images = await DB.prepare(
    'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC'
  ).bind(id).all();

  return c.json({ product, images: images.results ?? [] });
});

// Categorías
publicRoutes.get('/categories', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare(
    'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC'
  ).all();
  return c.json({ categories: results ?? [] });
});

// Servicios
publicRoutes.get('/services', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare(
    'SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC'
  ).all();
  return c.json({ services: results ?? [] });
});

// Detalle de servicio
publicRoutes.get('/services/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const service = await DB.prepare('SELECT * FROM services WHERE id = ? AND is_active = 1').bind(id).first();
  if (!service) return c.notFound();
  return c.json({ service });
});

// Preguntas frecuentes
publicRoutes.get('/faq', async (c) => {
  const { DB } = c.env;
  const categoryId = c.req.query('category_id');
  let sql = 'SELECT * FROM frequently_asked_questions WHERE is_active = 1';
  const params: any[] = [];
  if (categoryId) {
    sql += ' AND (category_id = ? OR category_id IS NULL)';
    params.push(categoryId);
  }
  sql += ' ORDER BY sort_order ASC';
  const { results } = await DB.prepare(sql).bind(...params).all();
  return c.json({ faqs: results ?? [] });
});

// Galería de trabajos
publicRoutes.get('/gallery', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare(
    'SELECT * FROM work_gallery WHERE is_active = 1 ORDER BY sort_order ASC'
  ).all();
  return c.json({ gallery: results ?? [] });
});

// Configuración pública (YouTube, sitio, etc.)
publicRoutes.get('/settings', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT key, value FROM system_settings').all<{
    key: string;
    value: string;
  }>();
  const settings: Record<string, string> = {};
  for (const row of results ?? []) {
    settings[row.key] = row.value;
  }
  return c.json({ settings });
});