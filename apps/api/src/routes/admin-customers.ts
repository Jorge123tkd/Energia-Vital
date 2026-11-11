import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';

export const adminCustomersRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
adminCustomersRoutes.use('*', requireStaffAuth);

function audit(c: any, action: string, customerId: string) {
  return c.env.DB.prepare(`INSERT INTO audit_logs (id, admin_user_id, action, entity_type, entity_id, created_at)
    VALUES (?, ?, ?, 'customer', ?, ?)`).bind(
      crypto.randomUUID(), c.get('user')?.user_id || null, action, customerId, new Date().toISOString());
}


adminCustomersRoutes.get('/customers', async c => {
  const query = (c.req.query('q') || '').trim().toLowerCase().slice(0, 120);
  const base = 'SELECT id, name, email, phone, address, city, province, phone_verified, is_active, created_at FROM customers';
  const matching = query
    ? ` WHERE instr(lower(id), ?) > 0 OR instr(lower(name), ?) > 0
      OR instr(lower(email), ?) > 0 OR instr(lower(coalesce(phone, '')), ?) > 0`
    : '';
  const statement = c.env.DB.prepare(base + matching + ' ORDER BY created_at DESC LIMIT 200');
  const { results } = query ? await statement.bind(query, query, query, query).all() : await statement.all();
  return c.json({ customers: results ?? [] });
});
// Perfil comercial: no se permite editar contraseñas ni roles desde este módulo.
const trim = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9 ()-]{8,20}$/;

adminCustomersRoutes.patch('/customers/:id', requireAdminAuth, async c => {
  const id = c.req.param('id')!;
  const original = await c.env.DB.prepare('SELECT id, name, email, phone, address, city, province FROM customers WHERE id = ?').bind(id).first<any>();
  if (!original) return c.json({ error: 'Cliente no encontrado' }, 404);
  const body = await c.req.json<any>().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['name', 'email', 'phone', 'address', 'city', 'province'].includes(k)))
    return c.json({ error: 'Solo se pueden modificar los datos de contacto del cliente' }, 400);
  const next = { ...original, ...body };
  const name = trim(next.name, 120), email = trim(next.email, 254).toLowerCase();
  const phone = trim(next.phone, 25), address = trim(next.address, 250);
  const city = trim(next.city, 100), province = trim(next.province, 100);
  if (name.length < 3 || !emailPattern.test(email) || !phonePattern.test(phone) ||
      address.length < 6 || city.length < 2 || province.length < 2)
    return c.json({ error: 'Comprueba nombre, correo, teléfono, dirección, municipio y provincia.' }, 400);
  const taken = await c.env.DB.prepare('SELECT id FROM customers WHERE LOWER(email) = ? AND id != ?')
    .bind(email, id).first();
  if (taken) return c.json({ error: 'El correo pertenece a otra cuenta' }, 409);
  const adminEmail = await c.env.DB.prepare('SELECT id FROM admin_users WHERE LOWER(email) = ?').bind(email).first();
  if (adminEmail) return c.json({ error: 'Ese correo está reservado para una cuenta administrativa' }, 409);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, province = ?,
        phone_verified = CASE WHEN phone = ? THEN phone_verified ELSE 0 END, updated_at = ? WHERE id = ?`)
        .bind(name, email, phone, address, city, province, phone, new Date().toISOString(), id),
      audit(c, 'customer_updated', id),
    ]);
  } catch (e) {
    const detail = e instanceof Error ? e.message : '';
    if (/UNIQUE|constraint/i.test(detail)) return c.json({ error: 'El correo ya está en uso' }, 409);
    throw e;
  }
  return c.json({ message: 'Ficha de cliente actualizada' });
});

adminCustomersRoutes.patch('/customers/:id/status', requireAdminAuth, async c => {
  const id = c.req.param('id')!;
  const b = await c.req.json<any>().catch(() => null);
  if (!b || typeof b.is_active !== 'boolean')
    return c.json({ error: 'Indica el estado activo o bloqueado' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: 'Cliente no encontrado' }, 404);
  const now = new Date().toISOString();
  const statements = [
    c.env.DB.prepare('UPDATE customers SET is_active = ?, updated_at = ? WHERE id = ?')
      .bind(b.is_active ? 1 : 0, now, id),
  ];
  if (!b.is_active) {
    statements.push(c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ?
      WHERE user_id = ? AND user_type = 'customer' AND revoked_at IS NULL`).bind(now, id));
  }
  statements.push(audit(c, b.is_active ? 'customer_reactivated' : 'customer_blocked', id));
  await c.env.DB.batch(statements);
  return c.json({ message: b.is_active ? 'Cliente reactivado' : 'Cliente bloqueado y sesiones cerradas' });
});

// La eliminación irreversible solo se permite si no existe historial asociado.
adminCustomersRoutes.delete('/customers/:id', requireAdminAuth, async c => {
  const id = c.req.param('id')!;
  const exists = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: 'Cliente no encontrado' }, 404);
  const linked = ['requests', 'appointments', 'assistant_sessions', 'giveaway_participants',
    'giveaway_winners', 'reward_redemptions'];
  for (const table of linked) {
    const found = await c.env.DB.prepare(`SELECT 1 AS found FROM ${table} WHERE customer_id = ? LIMIT 1`).bind(id).first();
    if (found) return c.json({
      error: 'Este cliente tiene actividad asociada. Bloquéalo para conservar solicitudes, citas e historial.'
    }, 409);
  }
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ? AND user_type = 'customer'`).bind(id),
      c.env.DB.prepare('DELETE FROM phone_verifications WHERE customer_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM telegram_links WHERE customer_id = ?').bind(id),
      c.env.DB.prepare(`DELETE FROM notifications WHERE user_id = ? AND user_type = 'customer'`).bind(id),
      c.env.DB.prepare('DELETE FROM customer_points WHERE customer_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM customers WHERE id = ?').bind(id),
      audit(c, 'customer_deleted', id),
    ]);
  } catch (e) {
    const detail = e instanceof Error ? e.message : '';
    if (/FOREIGN KEY|constraint/i.test(detail))
      return c.json({ error: 'Existen registros vinculados. Utiliza Bloquear para conservar el historial.' }, 409);
    throw e;
  }
  return c.json({ message: 'Cliente eliminado definitivamente' });
});

adminCustomersRoutes.get('/requests', async c => {
  const { results } = await c.env.DB.prepare(`SELECT r.id, r.customer_id, r.type, r.request_category_id, r.title, r.description,
    r.status, r.location, r.preferred_date, r.created_at, cu.name AS customer_name,
    cu.email, cu.phone, COALESCE(rc.name, r.type) AS category_name,
    (SELECT COUNT(*) FROM request_images im WHERE im.request_id = r.id) AS image_count
    FROM requests r
    LEFT JOIN customers cu ON cu.id = r.customer_id
    LEFT JOIN request_categories rc ON rc.id = r.request_category_id
    ORDER BY r.created_at DESC LIMIT 200`).all();
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
