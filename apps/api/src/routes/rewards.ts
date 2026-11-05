import { Hono } from 'hono';
import { Env } from '../types';
import { requireAdminAuth, requireCustomerAuth, getUser } from '../middleware';

export const rewardsRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

/* ─── CATÁLOGO DE RECOMPENSAS ─── */

// Listar catálogo activo (público / customer)
rewardsRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM reward_catalog WHERE is_active = 1 ORDER BY name ASC'
  ).all<any>();
  return c.json({ rewards: results ?? [] });
});

// Crear un ítem (admin)
rewardsRoutes.post('/', requireAdminAuth, async (c) => {
  const b = await c.req.json<any>();
  if (!b.name || !b.cost || b.cost < 0) return c.json({ error: 'name y cost (>=0) son requeridos' }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO reward_catalog (id, name, description, cost, stock_quantity, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(id, b.name, b.description || null, b.cost, b.stock_quantity || null, now, now)
    .run();
  return c.json({ id, message: 'Recompensa creada' });
});

// Actualizar / eliminar (admin)
rewardsRoutes.patch('/:id', requireAdminAuth, async (c) => {
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE reward_catalog SET
     name = COALESCE(?, name), description = COALESCE(?, description),
     cost = COALESCE(?, cost), stock_quantity = COALESCE(?, stock_quantity),
     is_active = COALESCE(?, is_active), updated_at = ?
     WHERE id = ?`
  )
    .bind(b.name || null, b.description || null, b.cost || null, b.stock_quantity || null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : null, now, c.req.param('id'))
    .run();
  return c.json({ message: 'Recompensa actualizada' });
});

rewardsRoutes.delete('/:id', requireAdminAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM reward_catalog WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Recompensa eliminada' });
});

/* ─── CANJE DE PUNTOS ─── */

// Balance de puntos (customer)
rewardsRoutes.get('/balance', requireCustomerAuth, async (c) => {
  const user = getUser(c)!;
  const row = await c.env.DB.prepare('SELECT * FROM customer_points WHERE customer_id = ?').bind(user.user_id).first<any>();
  if (!row) {
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      'INSERT INTO customer_points (customer_id, balance, total_earned, total_spent, updated_at) VALUES (?, 0, 0, 0, ?)'
    ).bind(user.user_id, now).run();
    return c.json({ balance: 0, total_earned: 0, total_spent: 0 });
  }
  return c.json({ balance: row.balance, total_earned: row.total_earned, total_spent: row.total_spent });
});

// Canjear una recompensa (customer)
rewardsRoutes.post('/:id/redeem', requireCustomerAuth, async (c) => {
  const { DB } = c.env;
  const user = getUser(c)!;
  const rewardId = c.req.param('id');

  const reward = await DB.prepare('SELECT * FROM reward_catalog WHERE id = ? AND is_active = 1')
    .bind(rewardId).first<any>();
  if (!reward) return c.json({ error: 'Recompensa no encontrada' }, 404);
  if (reward.stock_quantity !== null && reward.stock_quantity <= 0) return c.json({ error: 'Sin stock' }, 400);

  const points = await DB.prepare('SELECT * FROM customer_points WHERE customer_id = ?').bind(user.user_id).first<any>();
  const balance = points ? points.balance : 0;
  if (balance < reward.cost) return c.json({ error: 'Puntos insuficientes' }, 400);

  const now = new Date().toISOString();
  const redemptionId = crypto.randomUUID();
  const redemptionCode = crypto.randomUUID().slice(0, 8).toUpperCase();

  await DB.prepare(
    `INSERT INTO reward_redemptions (id, customer_id, reward_id, points_spent, status, redemption_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'redeemed', ?, ?, ?)`
  ).bind(redemptionId, user.user_id, rewardId, reward.cost, redemptionCode, now, now).run();

  if (points) {
    await DB.prepare('UPDATE customer_points SET balance = balance - ?, total_spent = total_spent + ?, updated_at = ? WHERE customer_id = ?')
      .bind(reward.cost, reward.cost, now, user.user_id).run();
  } else {
    await DB.prepare('INSERT INTO customer_points (customer_id, balance, total_earned, total_spent, updated_at) VALUES (?, -?, 0, ?, ?)')
      .bind(user.user_id, reward.cost, reward.cost, now).run();
  }

  if (reward.stock_quantity !== null) {
    await DB.prepare('UPDATE reward_catalog SET stock_quantity = stock_quantity - 1 WHERE id = ?').bind(rewardId).run();
  }

  await DB.prepare(
    `INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
     VALUES (?, ?, 'customer', 'reward_available', ?, ?, 0, ?)`
  ).bind(crypto.randomUUID(), user.user_id, 'Recompensa canjeada',
    `Has canjeado ${reward.name} por ${reward.cost} puntos. Código: ${redemptionCode}`, now).run();

  return c.json({
    message: 'Recompensa canjeada',
    redemption: { id: redemptionId, reward_name: reward.name, points_spent: reward.cost, redemption_code: redemptionCode },
  });
});

// Historial de canjes del customer
rewardsRoutes.get('/redemptions', requireCustomerAuth, async (c) => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, rc.name as reward_name FROM reward_redemptions r
     JOIN reward_catalog rc ON r.reward_id = rc.id
     WHERE r.customer_id = ? ORDER BY r.created_at DESC`
  ).bind(user.user_id).all<any>();
  return c.json({ redemptions: results ?? [] });
});

// Canjes de un ítem (admin)
rewardsRoutes.get('/:id/redemptions', requireAdminAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, rc.name as reward_name, cust.name as customer_name
     FROM reward_redemptions r
     JOIN reward_catalog rc ON r.reward_id = rc.id
     LEFT JOIN customers cust ON r.customer_id = cust.id
     WHERE r.reward_id = ? ORDER BY r.created_at DESC`
  ).bind(c.req.param('id')).all<any>();
  return c.json({ redemptions: results ?? [] });
});

