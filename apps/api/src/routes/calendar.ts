import { Hono } from 'hono';
import { Env } from '../types';

export const calendarRoutes = new Hono<{ Bindings: Env }>();

calendarRoutes.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return c.json({ error: 'Token requerido' }, 401);
  await next();
});

// Disponibilidad para citas
calendarRoutes.get('/availability', async (c) => {
  const { DB } = c.env;
  const date = c.req.query('date');
  if (!date) return c.json({ error: 'Fecha requerida' }, 400);

  const start = new Date(date + 'T00:00:00').toISOString();
  const end = new Date(date + 'T23:59:59').toISOString();

  const { results } = await DB.prepare(
    'SELECT * FROM appointments WHERE starts_at >= ? AND starts_at <= ? AND status != ? ORDER BY starts_at ASC'
  ).bind(start, end, 'cancelled').all();

  return c.json({ date, appointments: results ?? [] });
});

// Horarios disponibles (franjas horarias)
calendarRoutes.get('/slots', async (c) => {
  const date = c.req.query('date');
  const serviceId = c.req.query('service_id');
  const duration = parseInt(c.req.query('duration_minutes') || '60');

  if (!date) return c.json({ error: 'Fecha requerida' }, 400);

  const startDay = new Date(date + 'T08:00:00').toISOString();
  const endDay = new Date(date + 'T18:00:00').toISOString();

  const { DB } = c.env;
  const { results } = await DB.prepare(
    'SELECT * FROM appointments WHERE starts_at >= ? AND starts_at <= ? AND status != ? ORDER BY starts_at ASC'
  ).bind(startDay, endDay, 'cancelled').all();

  const slots: string[] = [];
  let current = new Date(startDay);
  const end = new Date(endDay);

  while (current < end) {
    const slotStart = current.toISOString();
    const slotEnd = new Date(current.getTime() + duration * 60000).toISOString();

    const conflict = (results ?? []).some((a: any) => {
      const aStart = new Date(a.starts_at).getTime();
      const aEnd = new Date(a.ends_at).getTime();
      const sStart = new Date(slotStart).getTime();
      const sEnd = new Date(slotEnd).getTime();
      return sStart < aEnd && sEnd > aStart;
    });

    if (!conflict) slots.push(slotStart);
    current = new Date(current.getTime() + 30 * 60000); // pasos de 30 min
  }

  return c.json({ date, duration_minutes: duration, slots });
});