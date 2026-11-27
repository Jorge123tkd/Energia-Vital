import { Hono } from 'hono';
import type { Env } from '../types';
import { requireCustomerAuth } from '../middleware';
import {cubanDayBounds,cubanAppointmentTime} from '../telegram-customer-appointments';

export const calendarRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
calendarRoutes.use('*', requireCustomerAuth);

calendarRoutes.get('/availability', async c => {
  const date = c.req.query('date') || '';
  const bounds = cubanDayBounds(date);
  if (!bounds) return c.json({ error: 'Fecha inválida' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT starts_at, ends_at FROM appointments WHERE status != 'cancelled' AND starts_at < ? AND ends_at > ? ORDER BY starts_at`)
    .bind(bounds.end, bounds.start).all();
  // No revelar nombres, teléfonos ni datos personales de otras reservas.
  return c.json({ date, occupied: results ?? [] });
});

calendarRoutes.get('/slots', async c => {
  const date = c.req.query('date') || '';
  const bounds = cubanDayBounds(date);
  const duration = Number(c.req.query('duration_minutes') || 60);
  if (!bounds || !Number.isInteger(duration) || duration < 30 || duration > 240) return c.json({ error: 'Fecha o duración inválidas' }, 400);
  const { results } = await c.env.DB.prepare('SELECT starts_at, ends_at FROM appointments WHERE status != ? AND starts_at < ? AND ends_at > ?')
    .bind('cancelled', bounds.end, bounds.start).all<any>();
  const slots: string[] = [];
  for (let minute = 8 * 60; minute + duration <= 18 * 60; minute += 30) {
    const local=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
    const start=cubanAppointmentTime(date+' '+local);if(!start)continue;
    const s=start.getTime(),e=s+duration*60000;
    if (s <= Date.now()) continue;
    if (!(results ?? []).some(a => s < Date.parse(a.ends_at) && e > Date.parse(a.starts_at))) slots.push(new Date(s).toISOString());
  }
  return c.json({ date, duration_minutes: duration, slots, timezone: 'America/Havana' });
});
