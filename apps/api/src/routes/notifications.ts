import { Hono } from 'hono';
import type { Env } from '../types';
import { getUser, requireAdminAuth, requireCustomerAuth, requireStaffAuth } from '../middleware';

export const notificationsRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
notificationsRoutes.get('/', requireCustomerAuth, async c => {
  const user = getUser(c)!;
  const paged = c.req.query('page') !== undefined;
  const page = Math.max(1, Math.min(100000, Number.parseInt(c.req.query('page') || '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(c.req.query('page_size') || '10', 10) || 10));
  const { results } = await c.env.DB.prepare(`SELECT id, type, title, message, is_read, created_at FROM notifications
    WHERE user_id = ? AND user_type = 'customer' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(user.user_id, paged ? pageSize : 50, paged ? (page - 1) * pageSize : 0).all();
  if (!paged) return c.json({ notifications: results ?? [] });
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND user_type = 'customer'`)
    .bind(user.user_id).first<{n:number}>();
  return c.json({ notifications: results ?? [], total: count?.n || 0, page, page_size: pageSize });
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
  const paged = c.req.query('page') !== undefined;
  const page = Math.max(1, Math.min(100000, Number.parseInt(c.req.query('page') || '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(c.req.query('page_size') || '10', 10) || 10));
  const { results } = await c.env.DB.prepare(`SELECT id, type, title, message, is_read, created_at FROM notifications
    WHERE user_id = ? AND user_type = 'admin' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(user.user_id, paged ? pageSize : 100, paged ? (page - 1) * pageSize : 0).all();
  if (!paged) return c.json({ notifications: results ?? [] });
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND user_type = 'admin'`)
    .bind(user.user_id).first<{n:number}>();
  return c.json({ notifications: results ?? [], total: count?.n || 0, page, page_size: pageSize });
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
    LEFT JOIN customers cu ON cu.id = n.user_id
    WHERE n.user_type = 'customer' AND n.type IN ('admin_message','welcome')
    ORDER BY n.created_at DESC LIMIT 100`).all();
  return c.json({ notifications: results ?? [] });
});
// El centro de notificaciones de /admin muestra campañas enviadas a clientes,
// NO los avisos operativos de nuevas solicitudes/citas del personal.
notificationsRoutes.get('/admin/sent', requireAdminAuth, async c => {
  const page=Math.max(1,Math.min(100000,Number.parseInt(c.req.query('page')||'1',10)||1));
  const size=Math.max(1,Math.min(50,Number.parseInt(c.req.query('page_size')||'10',10)||10));
  const groupKey=`n.type || '|' || COALESCE(NULLIF(n.data,''), n.created_at || '|' || n.title || '|' || n.message)`;
  const {results}=await c.env.DB.prepare(`SELECT MIN(n.id) AS id,
    MAX(n.title) AS title,MAX(n.message) AS message,MAX(n.created_at) AS created_at,
    MIN(n.data) AS campaign_data,MIN(n.type) AS notification_type,COUNT(*) AS recipient_count
    FROM notifications n WHERE n.user_type='customer' AND n.type IN ('admin_message','welcome')
    GROUP BY ${groupKey} ORDER BY MAX(n.created_at) DESC LIMIT ? OFFSET ?`)
    .bind(size,(page-1)*size).all();
  const totalRow=await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (
    SELECT 1 FROM notifications n WHERE n.user_type='customer' AND n.type IN ('admin_message','welcome')
    GROUP BY ${groupKey})`).first<{n:number}>();
  return c.json({campaigns:results||[],total:totalRow?.n||0,page,page_size:size});
});

const welcomeKeys=['welcome_notification_enabled','welcome_notification_title','welcome_notification_message'];
notificationsRoutes.get('/admin/automation', requireAdminAuth, async c => {
  const {results}=await c.env.DB.prepare(`SELECT key,value FROM system_settings WHERE key IN (?,?,?)`)
    .bind(...welcomeKeys).all<{key:string;value:string}>();
  const settings=Object.fromEntries((results||[]).map(x=>[x.key,x.value]));
  return c.json({
    enabled:settings.welcome_notification_enabled!=='false',
    title:settings.welcome_notification_title||'¡Bienvenido a Bonaire!',
    message:settings.welcome_notification_message||
      'Gracias por registrarte. Desde tu cuenta puedes solicitar servicios, consultar tus citas y recibir notificaciones.',
  });
});
notificationsRoutes.put('/admin/automation', requireAdminAuth, async c => {
  const body=await c.req.json<any>().catch(()=>null);
  if (!body || typeof body.enabled!=='boolean' || typeof body.title!=='string' || typeof body.message!=='string')
    return c.json({error:'Configuración incompleta.'},400);
  const title=body.title.trim(),message=body.message.trim();
  if(title.length<3||title.length>120||message.length<10||message.length>800)
    return c.json({error:'Título (3–120 caracteres) y mensaje (10–800 caracteres) requeridos.'},400);
  const now=new Date().toISOString();
  await c.env.DB.batch([
    ...Object.entries({
      welcome_notification_enabled:String(body.enabled),
      welcome_notification_title:title,
      welcome_notification_message:message,
    }).map(([key,value])=>c.env.DB.prepare(`INSERT INTO system_settings (id,key,value,updated_at)
      VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),key,value,now)),
    c.env.DB.prepare(`INSERT INTO audit_logs (id,admin_user_id,action,entity_type,details,created_at)
      VALUES (?,?,'welcome_notification.configure','notification',?,?)`)
      .bind(crypto.randomUUID(),getUser(c)!.user_id,JSON.stringify({enabled:body.enabled}),now),
  ]);
  return c.json({message:'Bienvenida automática configurada.'});
});
notificationsRoutes.post('/admin/send', requireAdminAuth, async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>();
  if(!Array.isArray(b.customer_ids)||b.customer_ids.length>100 ||
     b.customer_ids.some((id:unknown)=>typeof id!=='string'||!id.trim()||id.length>100))
    return c.json({error:'Selecciona entre 1 y 100 clientes válidos.'},400);
  const customers=[...new Set(b.customer_ids as string[])];
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
  if (!title || !message || !customers.length) return c.json({ error: 'Destinatarios, título y mensaje requeridos' }, 400);
  const now = new Date().toISOString();
  const placeholders=customers.map(()=>'?').join(',');
  const valid=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM customers WHERE is_active=1 AND id IN ('+placeholders+')')
    .bind(...customers).first<{n:number}>();
  if((valid?.n||0)!==customers.length)
    return c.json({error:'Alguno de los destinatarios no existe o tiene la cuenta desactivada. Vuelve a buscarlos.'},400);
  const data=JSON.stringify({campaign_id:crypto.randomUUID(),audience:'selected'});
  const statements = customers.map(id => c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, data, is_read, created_at)
    SELECT ?, id, 'customer', 'admin_message', ?, ?, ?, 0, ? FROM customers WHERE id = ? AND is_active=1`)
    .bind(crypto.randomUUID(), title, message, data, now, id));
  await c.env.DB.batch(statements);
  await c.env.DB.prepare(`INSERT INTO audit_logs (id, admin_user_id, action, entity_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), user.user_id, 'notifications.send', 'notifications', JSON.stringify({ count: customers.length }), now).run();
  return c.json({ message: 'Notificaciones enviadas', sent:customers.length });
});
notificationsRoutes.post('/admin/send-all', requireAdminAuth, async c => {
  const user = getUser(c)!;
  const b = await c.req.json<any>();
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 200) : '';
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 2000) : '';
  if (!title || !message) return c.json({ error: 'Título y mensaje requeridos' }, 400);
  const now = new Date().toISOString();
  const data=JSON.stringify({campaign_id:crypto.randomUUID(),audience:'all'});
  const result = await c.env.DB.prepare(`INSERT INTO notifications (id, user_id, user_type, type, title, message, data, is_read, created_at)
    SELECT lower(hex(randomblob(16))), id, 'customer', 'admin_message', ?, ?, ?, 0, ? FROM customers WHERE is_active=1`)
    .bind(title, message, data, now).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs (id, admin_user_id, action, entity_type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), user.user_id, 'notifications.send_all', 'notifications', JSON.stringify({ count: result.meta?.changes }), now).run();
  return c.json({ sent: result.meta?.changes ?? 0 });
});
