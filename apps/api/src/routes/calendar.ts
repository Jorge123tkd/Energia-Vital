import { Hono } from 'hono';
import type { Env } from '../types';
import { requireCustomerAuth } from '../middleware';

export const calendarRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
calendarRoutes.use('*', requireCustomerAuth);

function dayBounds(date: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  const start = `${date}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + 86400000).toISOString();
  return { start, end };
}

calendarRoutes.get('/availability', async c => {
  const date = c.req.query('date') || '';
  const bounds = dayBounds(date);
  if (!bounds) return c.json({ error: 'Fecha inválida' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT starts_at, ends_at FROM appointments WHERE status != 'cancelled' AND starts_at < ? AND ends_at > ? ORDER BY starts_at`)
    .bind(bounds.end, bounds.start).all();
  // No revelar nombres, teléfonos ni datos personales de otras reservas.
  return c.json({ date, occupied: results ?? [] });
});

calendarRoutes.get('/slots', async c => {
  const date = c.req.query('date') || '';
  const bounds = dayBounds(date);
  const duration = Number(c.req.query('duration_minutes') || 60);
  if (!bounds || !Number.isInteger(duration) || duration < 30 || duration > 240) return c.json({ error: 'Fecha o duración inválidas' }, 400);
  const { results } = await c.env.DB.prepare('SELECT starts_at, ends_at FROM appointments WHERE status != ? AND starts_at < ? AND ends_at > ?')
    .bind('cancelled', bounds.end, bounds.start).all<any>();
  const base = Date.parse(bounds.start), slots: string[] = [];
  for (let minute = 8 * 60; minute + duration <= 18 * 60; minute += 30) {
    const s = base + minute * 60000, e = s + duration * 60000;
    if (s <= Date.now()) continue;
    if (!(results ?? []).some(a => s < Date.parse(a.ends_at) && e > Date.parse(a.starts_at))) slots.push(new Date(s).toISOString());
  }
  return c.json({ date, duration_minutes: duration, slots, timezone: 'UTC' });
});
