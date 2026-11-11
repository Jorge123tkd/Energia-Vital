import { Hono } from 'hono';
import type { Env } from '../types';
import { getUser, requireCustomerAuth } from '../middleware';

export const privateRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
privateRoutes.use('*', requireCustomerAuth);

const allowedTypes = new Set(['installation', 'maintenance', 'repair', 'consultation', 'complaint', 'suggestion']);

privateRoutes.get('/requests', async c => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(`SELECT id, type, request_category_id, title, description, status, preferred_date, created_at,
    (SELECT COUNT(*) FROM request_images im WHERE im.request_id=requests.id) AS image_count
    FROM requests WHERE customer_id = ? ORDER BY created_at DESC`)
    .bind(user.user_id).all();
  return c.json({ requests: results ?? [] });
});

privateRoutes.post('/requests', async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ error: 'Solicitud inválida.' },400);
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 180) : '';
  const description = typeof b.description === 'string' ? b.description.trim().slice(0, 3000) : '';
  const requestedCategory = typeof b.category_id === 'string' ? b.category_id.slice(0,80) : '';
  const chosen = requestedCategory
    ? await c.env.DB.prepare('SELECT id,legacy_type FROM request_categories WHERE id=? AND is_active=1')
      .bind(requestedCategory).first<{id:string;legacy_type:string}>() : null;
  if (requestedCategory && !chosen) return c.json({ error: 'El tipo de solicitud seleccionado no está disponible.' },400);
  const type = chosen?.legacy_type || (allowedTypes.has(b.type) ? b.type : 'consultation');
  const categoryId = chosen?.id || type;
  if (title.length < 3 || description.length < 6) return c.json({ error: 'Escribe un título y una descripción' }, 400);
  const customer = await c.env.DB.prepare('SELECT address, city, province FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  const location = [customer?.address, customer?.city, customer?.province].filter(Boolean).join(', ');
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO requests (id, customer_id, type, request_category_id, title, description, status, priority, location, preferred_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 'medium', ?, ?, ?, ?)`)
    .bind(id, user.user_id, type, categoryId, title, description, location, typeof b.preferred_date === 'string' ? b.preferred_date.slice(0, 32) : null, now, now).run();
  // Notificar al personal; la solicitud no falla si el aviso no puede entregarse.
  try {
    await c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
      SELECT lower(hex(randomblob(16))), id, 'admin', 'new_request', 'Nueva solicitud de cliente', ?, 0, ?
      FROM admin_users WHERE is_active = 1 AND role IN ('admin','operator')`)
      .bind(title, now).run();
  } catch (e) { console.error('No se pudo crear el aviso de solicitud', e); }
  return c.json({ id, message: 'Solicitud creada', status: 'pending' }, 201);
});

privateRoutes.get('/appointments', async c => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare('SELECT id, title, starts_at, ends_at, status, service_id, created_at FROM appointments WHERE customer_id = ? ORDER BY starts_at DESC')
    .bind(user.user_id).all();
  return c.json({ appointments: results ?? [] });
});

privateRoutes.post('/appointments', async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>();
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 180) : '';
  const starts = new Date(b.starts_at), ends = new Date(b.ends_at);
  if (title.length < 3 || !Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts || ends.getTime() - starts.getTime() > 4 * 3600000 || starts.getTime() < Date.now())
    return c.json({ error: 'Fecha u horario inválidos' }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  // Una única sentencia SQL comprueba e inserta; evita la carrera SELECT + INSERT.
  const result = await c.env.DB.prepare(`INSERT INTO appointments (id, customer_id, service_id, request_id, title, starts_at, ends_at, status, notes, created_at, updated_at)
    SELECT ?, ?, NULL, NULL, ?, ?, ?, 'pending', NULL, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE status != 'cancelled' AND starts_at < ? AND ends_at > ?)`)
    .bind(id, user.user_id, title, starts.toISOString(), ends.toISOString(), now, now, ends.toISOString(), starts.toISOString()).run();
  if (!result.meta?.changes) return c.json({ error: 'Horario no disponible' }, 409);
  try {
    await c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
      SELECT lower(hex(randomblob(16))), id, 'admin', 'new_appointment', 'Nueva cita solicitada', ?, 0, ?
      FROM admin_users WHERE is_active = 1 AND role IN ('admin','operator')`)
      .bind(title, now).run();
  } catch (e) { console.error('No se pudo crear el aviso de cita', e); }
  return c.json({ id, message: 'Cita solicitada', status: 'pending' }, 201);
});
// Cambios de estado, notas y asignaciones solo desde endpoints del administrador.
