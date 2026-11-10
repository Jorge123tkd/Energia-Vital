import { Hono } from 'hono';
import type { Env } from '../types';
import { getUser, requireAdminAuth, requireCustomerAuth, requireStaffAuth } from '../middleware';

export const notificationsRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
notificationsRoutes.get('/', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(`SELECT id, type, title, message, is_read, created_at FROM notifications
    WHERE user_id = ? AND user_type = 'customer' ORDER BY created_at DESC LIMIT 50`).bind(user.user_id).all();
  return c.json({ notifications: results ?? [] });
});
notificationsRoutes.patch('/:id/read', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND user_type = 'customer'")
    .bind(c.req.param('id'), user.user_id).run();
  return c.json({ message: 'Notificación leída' });
});
// Bandeja privada del personal, separada de los mensajes de los clientes.
notificationsRoutes.get('/inbox', requireStaffAuth, async c => {
  const user = getUser(c)!;
  const { results } = await c.env.DB.prepare(`SELECT id, type, title, message, is_read, created_at FROM notifications
    WHERE user_id = ? AND user_type = 'admin' ORDER BY created_at DESC LIMIT 100`)
    .bind(user.user_id).all();
  return c.json({ notifications: results ?? [] });
});
notificationsRoutes.patch('/inbox/:id/read', requireStaffAuth, async c => {
  const user = getUser(c)!;
  await c.env.DB.prepare(`UPDATE notifications SET is_read = 1
    WHERE id = ? AND user_id = ? AND user_type = 'admin'`)
    .bind(c.req.param('id'), user.user_id).run();
  return c.json({ message: 'Notificación leída' });
});
notificationsRoutes.get('/admin', requireAdminAuth, async c => {
  const { results } = await c.env.DB.prepare(`SELECT n.*, cu.name AS customer_name FROM notifications n
    LEFT JOIN customers cu ON cu.id = n.user_id WHERE n.user_type = 'customer' ORDER BY n.created_at DESC LIMIT 100`).all();
  return c.json({ notifications: results ?? [] });
});
notificationsRoutes.post('/admin/send', requireAdminAuth, async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>();
  const customers = Array.isArray(b.customer_ids) ? [...new Set(b.customer_ids)].filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
  if (!title || !message || !customers.length) return c.json({ error: 'Destinatarios, título y mensaje requeridos' }, 400);
  const now = new Date().toISOString();
  const statements = customers.map(id => c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
    SELECT ?, id, 'customer', 'admin_message', ?, ?, 0, ? FROM customers WHERE id = ?`)
    .bind(crypto.randomUUID(), title, message, now, id));
  await c.env.DB.batch(statements);
  await c.env.DB.prepare(`INSERT INTO audit_logs (id, admin_user_id, action, entity_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), user.user_id, 'notifications.send', 'notifications', JSON.stringify({ count: customers.length }), now).run();
  return c.json({ message: 'Notificaciones procesadas' });
});
notificationsRoutes.post('/admin/send-all', requireAdminAuth, async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>();
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
  if (!title || !message) return c.json({ error: 'Título y mensaje requeridos' }, 400);
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
    SELECT lower(hex(randomblob(16))), id, 'customer', 'admin_message', ?, ?, 0, ? FROM customers`)
    .bind(title, message, now).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs (id, admin_user_id, action, entity_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), user.user_id, 'notifications.send_all', 'notifications', JSON.stringify({ count: result.meta?.changes }), now).run();
  return c.json({ sent: result.meta?.changes ?? 0 });
});
