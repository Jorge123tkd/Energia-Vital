import { Hono } from 'hono';
import { Env } from '../types';

export const privateRoutes = new Hono<{ Bindings: Env }>();

// Middleware simple de autenticación por bearer token
privateRoutes.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }
  const token = auth.substring(7);
  // Validar token contra D1 o variable de entorno (simplificado)
  const validToken = c.env.ADMIN_PASSWORD_HASH ? token === c.env.ADMIN_PASSWORD_HASH : true;
  if (!validToken) return c.json({ error: 'Token inválido' }, 401);
  await next();
});

// Solicitudes del cliente
privateRoutes.get('/requests', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  return c.json({ requests: results ?? [] });
});

privateRoutes.post('/requests', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await DB.prepare(
    'INSERT INTO requests (id, customer_id, type, title, description, status, priority, location, preferred_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.customer_id || null,
    body.type || 'consultation',
    body.title,
    body.description || null,
    'pending',
    body.priority || 'medium',
    body.location || null,
    body.preferred_date || null,
    now,
    now
  ).run();

  return c.json({ id, message: 'Solicitud creada' });
});

// Citas
privateRoutes.get('/appointments', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM appointments ORDER BY starts_at ASC').all();
  return c.json({ appointments: results ?? [] });
});

privateRoutes.post('/appointments', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<any>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Verificar disponibilidad (no solapamiento)
  const conflict = await DB.prepare(
    'SELECT id FROM appointments WHERE status != ? AND starts_at < ? AND ends_at > ?'
  ).bind('cancelled', body.ends_at, body.starts_at).first();

  if (conflict) {
    return c.json({ error: 'Horario no disponible' }, 409);
  }

  await DB.prepare(
    'INSERT INTO appointments (id, customer_id, service_id, request_id, title, starts_at, ends_at, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.customer_id || null,
    body.service_id || null,
    body.request_id || null,
    body.title,
    body.starts_at,
    body.ends_at,
    'pending',
    body.notes || null,
    now,
    now
  ).run();

  return c.json({ id, message: 'Cita creada' });
});

// Actualizar estado de cita
privateRoutes.patch('/appointments/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  const body = await c.req.json<any>();

  await DB.prepare(
    'UPDATE appointments SET status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?'
  ).bind(body.status, body.notes || null, new Date().toISOString(), id).run();

  return c.json({ message: 'Cita actualizada' });
});