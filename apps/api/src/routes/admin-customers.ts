import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth } from '../middleware';

export const adminCustomersRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
adminCustomersRoutes.use('*', requireAdminAuth);

adminCustomersRoutes.get('/customers', async c => {
  const { results } = await c.env.DB.prepare(`SELECT id, name, email, phone, address, city, province, phone_verified, created_at
    FROM customers ORDER BY created_at DESC LIMIT 200`).all();
  return c.json({ customers: results ?? [] });
});
adminCustomersRoutes.get('/requests', async c => {
  const { results } = await c.env.DB.prepare(`SELECT r.id, r.customer_id, r.type, r.title, r.description, r.status, r.location,
    r.preferred_date, r.created_at, cu.name AS customer_name, cu.email, cu.phone
    FROM requests r LEFT JOIN customers cu ON cu.id = r.customer_id ORDER BY r.created_at DESC LIMIT 200`).all();
  return c.json({ requests: results ?? [] });
});
adminCustomersRoutes.patch('/requests/:id', async c => {
  const b = await c.req.json<any>();
  if (!['pending', 'quoted', 'approved', 'scheduled', 'completed', 'cancelled'].includes(b.status)) return c.json({ error: 'Estado inválido' }, 400);
  const result = await c.env.DB.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?')
    .bind(b.status, new Date().toISOString(), c.req.param('id')).run();
  return result.meta?.changes ? c.json({ message: 'Solicitud actualizada' }) : c.json({ error: 'No encontrada' }, 404);
});
adminCustomersRoutes.get('/appointments', async c => {
  const { results } = await c.env.DB.prepare(`SELECT a.id, a.title, a.starts_at, a.ends_at, a.status, cu.name AS customer_name, cu.phone,
    cu.address, cu.city, cu.province FROM appointments a LEFT JOIN customers cu ON cu.id = a.customer_id
    ORDER BY a.starts_at DESC LIMIT 200`).all();
  return c.json({ appointments: results ?? [] });
});
adminCustomersRoutes.patch('/appointments/:id', async c => {
  const b = await c.req.json<any>();
  if (!['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(b.status)) return c.json({ error: 'Estado inválido' }, 400);
  const result = await c.env.DB.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
    .bind(b.status, new Date().toISOString(), c.req.param('id')).run();
  return result.meta?.changes ? c.json({ message: 'Cita actualizada' }) : c.json({ error: 'No encontrada' }, 404);
});
