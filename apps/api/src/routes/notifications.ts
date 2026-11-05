import { Hono } from 'hono';
import { Env } from '../types';
import { requireCustomerAuth, requireAdminAuth, optionalAuth, getUser } from '../middleware';

export const notificationsRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

/* ─── LISTAR NOTIFICACIONES ─── */

// Listar notificaciones del customer/admin autenticado
notificationsRoutes.get('/', requireCustomerAuth, async (c) => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM notifications WHERE user_id = ? AND user_type = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(user.user_id, user.user_id ? user.type : 'customer').all<any>();
  return c.json({ notifications: results ?? [] });
});

// Listar notificaciones del admin (todas las de los clientes)
notificationsRoutes.get('/admin', requireAdminAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT n.*, u.name as customer_name FROM notifications n
     LEFT JOIN customers u ON n.user_id = u.id
     WHERE n.user_type = 'customer' ORDER BY n.created_at DESC LIMIT 100`
  ).all<any>();
  return c.json({ notifications: results ?? [] });
});

// Marcar como leídas
notificationsRoutes.patch('/:id/read', requireCustomerAuth, async (c) => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND user_type = ?'
  ).bind(c.req.param('id'), user.user_id, user.type).all<any>();
  return c.json({ message: 'Notificación marcada como leída' });
});

// Marcar como leídas todas (por tipo)
notificationsRoutes.patch('/admin/read-all', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT type FROM notifications LIMIT 1').all<any>();
  // Marcar todas las entradas del usuario no leídas
  const { results: all } = await DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_type = ? AND is_read = 0'
  ).bind('customer').all<any>();
  return c.json({ count: all[0]?.changes || 0 });
});

/* ─── ADMIN: envío masivo de notificación ─── */

// Enviar notificación a un customer específico (admin)
notificationsRoutes.post('/admin/send', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const user = getUser(c)!;
  const b = await c.req.json<{
    customer_ids: string[];
    title: string;
    message: string;
    type: string;
    data?: string;
  }>();

  if (!b.customer_ids?.length || !b.title || !b.message) {
    return c.json({ error: 'customer_ids, title y message son requeridos' }, 400);
  }

  let count = 0;
  for (const customerId of b.customer_ids) {
    await DB.prepare(
      `INSERT INTO notifications (id, user_id, user_type, type, title, message, data, is_read, created_at)
       VALUES (?, ?, 'customer', ?, ?, ?, ?, 0, ?)`
    )
      .bind(crypto.randomUUID(), customerId, b.type || 'system', b.title, b.message, b.data || null, new Date().toISOString())
      .run();
    count++;
  }

  // Registrar en audit logs
  await DB.prepare(
    'INSERT INTO audit_logs (id, action, entity, entity_id, detail, performed_by, performed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), 'notif_send', 'notification', null, JSON.stringify({ customer_ids: b.customer_ids, count }), user.user_id, new Date().toISOString())
    .run();

  return c.json({ message: `Notificación enviada a ${count} cliente(s)` });
});

// Enviar notificación masiva a todos los clientes
notificationsRoutes.post('/admin/send-all', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const user = getUser(c)!;
  const b = await c.req.json<{ title: string; message: string; type?: string; data?: string }>();

  if (!b.title || !b.message) return c.json({ error: 'title y message son requeridos' }, 400);

  const { results } = await DB.prepare(
    'SELECT id FROM customers WHERE phone_verified = 1 OR telegram_chat_id IS NOT NULL'
  ).all<any>();

  let count = 0;
  for (const row of results ?? []) {
    await DB.prepare(
      `INSERT INTO notifications (id, user_id, user_type, type, title, message, data, is_read, created_at)
       VALUES (?, ?, 'customer', ?, ?, ?, ?, 0, ?)`
    )
      .bind(crypto.randomUUID(), row.id, b.type || 'system', b.title, b.message, b.data || null, new Date().toISOString())
      .run();
    count++;
  }

  await DB.prepare(
    'INSERT INTO audit_logs (id, action, entity, entity_id, detail, performed_by, performed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), 'notif_send_all', 'notification', null, JSON.stringify({ recipients: count }), user.user_id, new Date().toISOString())
    .run();

  return c.json({ message: `Notificación enviada a ${count} cliente(s)` });
});
