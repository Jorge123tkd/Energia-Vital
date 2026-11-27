import { Hono } from 'hono';
import type { Env } from '../types';
import { getUser, requireAdminAuth, requireCustomerAuth } from '../middleware';

export const rewardsRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
rewardsRoutes.get('/', requireCustomerAuth, async c => {
  const { results } = await c.env.DB.prepare('SELECT id, name, description, cost, stock_quantity FROM reward_catalog WHERE is_active = 1 ORDER BY name').all();
  return c.json({ rewards: results ?? [] });
});
rewardsRoutes.post('/', requireAdminAuth, async c => {
  const b = await c.req.json<any>();
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 160) : '';
  if (!name || !Number.isInteger(b.cost) || b.cost < 0) return c.json({ error: 'Nombre y coste de puntos enteros requeridos' }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await c.env.DB.prepare('INSERT INTO reward_catalog (id, name, description, cost, stock_quantity, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, name, typeof b.description === 'string' ? b.description.slice(0, 500) : null, b.cost, Number.isInteger(b.stock_quantity) ? b.stock_quantity : null, now, now).run();
  return c.json({ id }, 201);
});
rewardsRoutes.patch('/:id', requireAdminAuth, async c => {
  const b = await c.req.json<any>();
  const old = await c.env.DB.prepare('SELECT * FROM reward_catalog WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!old) return c.json({ error: 'Recompensa no encontrada' }, 404);
  await c.env.DB.prepare('UPDATE reward_catalog SET name = ?, description = ?, cost = ?, stock_quantity = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .bind(typeof b.name === 'string' ? b.name.trim().slice(0, 160) : old.name, typeof b.description === 'string' ? b.description.slice(0, 500) : old.description,
      Number.isInteger(b.cost) && b.cost >= 0 ? b.cost : old.cost,
      b.stock_quantity === null ? null : Number.isInteger(b.stock_quantity) && b.stock_quantity >= 0 ? b.stock_quantity : old.stock_quantity,
      typeof b.is_active === 'boolean' ? Number(b.is_active) : old.is_active,
      new Date().toISOString(), old.id).run();
  return c.json({ message: 'Recompensa actualizada' });
});
rewardsRoutes.delete('/:id', requireAdminAuth, async c => {
  await c.env.DB.prepare('UPDATE reward_catalog SET is_active = 0 WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Recompensa desactivada' });
});
rewardsRoutes.get('/balance', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  const row = await c.env.DB.prepare('SELECT * FROM customer_points WHERE customer_id = ?').bind(user.user_id).first<any>();
  return c.json({ balance: row?.balance ?? 0, total_earned: row?.total_earned ?? 0, total_spent: row?.total_spent ?? 0 });
});
rewardsRoutes.post('/:id/redeem', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  const id = crypto.randomUUID(), now = new Date().toISOString(), code = crypto.randomUUID().slice(0, 8).toUpperCase();
  try {
    // La migración 004 garantiza balance/stock y descuento atómico con triggers SQL.
    const result = await c.env.DB.prepare(`INSERT INTO reward_redemptions (id, customer_id, reward_id, points_spent, status, redemption_code, created_at, updated_at)
      SELECT ?, ?, id, cost, 'redeemed', ?, ?, ? FROM reward_catalog WHERE id = ? AND is_active = 1`)
      .bind(id, user.user_id, code, now, now, c.req.param('id')).run();
    if (!result.meta?.changes) return c.json({ error: 'Recompensa no disponible' }, 404);
  } catch { return c.json({ error: 'Puntos insuficientes o recompensa agotada' }, 409); }
  return c.json({ message: 'Canje registrado', redemption: { id, redemption_code: code } }, 201);
});
rewardsRoutes.get('/redemptions', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(`SELECT r.id, r.points_spent, r.status, r.redemption_code, r.created_at, rc.name AS reward_name
    FROM reward_redemptions r JOIN reward_catalog rc ON rc.id = r.reward_id WHERE r.customer_id = ? ORDER BY r.created_at DESC`)
    .bind(user.user_id).all();
  return c.json({ redemptions: results ?? [] });
});
rewardsRoutes.get('/:id/redemptions', requireAdminAuth, async c => {
  const { results } = await c.env.DB.prepare(`SELECT r.*, c.name AS customer_name FROM reward_redemptions r
    LEFT JOIN customers c ON c.id = r.customer_id WHERE r.reward_id = ? ORDER BY r.created_at DESC`)
    .bind(c.req.param('id')).all();
  return c.json({ redemptions: results ?? [] });
});
