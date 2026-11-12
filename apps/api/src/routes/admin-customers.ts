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
  const paged = c.req.query('page') !== undefined;
  const page = Math.max(1, Math.min(100000, Number.parseInt(c.req.query('page') || '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(c.req.query('page_size') || '12', 10) || 12));
  const base = 'SELECT id, name, email, phone, address, city, province, phone_verified, is_active, created_at FROM customers';
  const matching = query
    ? ` WHERE instr(lower(id), ?) > 0 OR instr(lower(name), ?) > 0
      OR instr(lower(email), ?) > 0 OR instr(lower(coalesce(phone, '')), ?) > 0
      OR instr(lower(coalesce(city, '')), ?) > 0 OR instr(lower(coalesce(province, '')), ?) > 0`
    : '';
  const args = query ? [query, query, query, query, query, query] : [];
  const { results } = await c.env.DB.prepare(base + matching + ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .bind(...args, paged ? pageSize : 200, paged ? (page-1)*pageSize : 0).all();
  if (!paged) return c.json({ customers: results ?? [] });
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM customers' + matching)
    .bind(...args).first<{n:number}>();
  return c.json({ customers: results ?? [], total: count?.n || 0, page, page_size: pageSize });
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
    'giveaway_winners', 'reward_redemptions', 'verified_product_purchases', 'product_reviews'];
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

function paging(c: any) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(c.req.query('page') || '1', 10) || 1));
  const pageSize = Math.max(5, Math.min(100, Number.parseInt(c.req.query('page_size') || '20', 10) || 20));
  const q = (c.req.query('q') || '').trim().toLowerCase().slice(0, 120);
  const advanced = c.req.query('page') !== undefined || c.req.query('page_size') !== undefined || q.length > 0;
  return { page, pageSize, q, advanced };
}

adminCustomersRoutes.get('/requests', async c => {
  const {page, pageSize, q, advanced} = paging(c);
  const where = q ? ` WHERE instr(lower(r.id), ?) > 0
    OR instr(lower(r.title), ?) > 0
    OR instr(lower(COALESCE(r.description,'')), ?) > 0
    OR instr(lower(COALESCE(cu.name,'')), ?) > 0
    OR instr(lower(COALESCE(cu.phone,'')), ?) > 0
    OR instr(lower(COALESCE(cu.email,'')), ?) > 0` : '';
  const args = q ? [q,q,q,q,q,q] : [];
  const joins = ` FROM requests r
    LEFT JOIN customers cu ON cu.id = r.customer_id
    LEFT JOIN request_categories rc ON rc.id = r.request_category_id`;
  const query = `SELECT r.id, r.customer_id, r.type, r.request_category_id, r.title, r.description,
    r.status, r.location, r.preferred_date, r.created_at, r.updated_at, cu.name AS customer_name,
    cu.email, cu.phone, COALESCE(rc.name, r.type) AS category_name,
    (SELECT COUNT(*) FROM request_images im WHERE im.request_id = r.id) AS image_count`
    + joins + where + ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  const {results} = await c.env.DB.prepare(query).bind(...args,advanced?pageSize:200,advanced?(page-1)*pageSize:0).all();
  if (!advanced) return c.json({requests:results||[]});
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n'+joins+where).bind(...args).first<{n:number}>();
  return c.json({requests:results||[],page,page_size:pageSize,total:total?.n||0});
});
adminCustomersRoutes.patch('/requests/:id', async c => {
  const b = await c.req.json<any>().catch(()=>null);
  if (!b || !['pending', 'quoted', 'approved', 'scheduled', 'completed', 'cancelled'].includes(b.status))
    return c.json({ error: 'Estado inválido' }, 400);
  const id=c.req.param('id');
  const prior=await c.env.DB.prepare('SELECT customer_id,status,title FROM requests WHERE id=?').bind(id).first<any>();
  if(!prior)return c.json({error:'No encontrada'},404);
  if(prior.status===b.status)return c.json({message:'Sin cambios'});
  const now=new Date().toISOString();
  const result=await c.env.DB.prepare('UPDATE requests SET status=?,updated_at=? WHERE id=? AND status=?')
    .bind(b.status,now,id,prior.status).run();
  if(!result.meta?.changes)return c.json({error:'La solicitud fue modificada. Actualiza el panel.'},409);
  if(prior.customer_id){
    try {
      const labels:Record<string,string>={pending:'pendiente',quoted:'presupuestada',approved:'aprobada',
        scheduled:'programada',completed:'terminada',cancelled:'cancelada'};
      await c.env.DB.prepare(`INSERT INTO notifications
        (id,user_id,user_type,type,title,message,is_read,created_at)
        VALUES (?,?,'customer','system',?,?,0,?)`).bind(
        crypto.randomUUID(),prior.customer_id,'Actualización de tu solicitud',
        'Tu solicitud «'+prior.title+'» (ref. '+id+') ahora está '+labels[b.status]+'.',now
      ).run();
    }catch(e){console.error('No se pudo avisar al cliente del cambio de solicitud',e);}
  }
  return c.json({message:'Solicitud actualizada'});
});
// Solo administradores pueden cambiar el contenido o eliminar una solicitud.
// El personal operador conserva el permiso de actualizar el estado de la solicitud.
adminCustomersRoutes.patch('/requests/:id/details', requireAdminAuth, async c => {
  const id=c.req.param('id');
  const b=await c.req.json<Record<string,unknown>>().catch(()=>null);
  if(!b || Object.keys(b).some(k=>!['title','description','location','preferred_date','expected_updated_at'].includes(k)))
    return c.json({error:'Solo se pueden editar el asunto, la descripción, la ubicación y la fecha preferida.'},400);
  if(typeof b.title!=='string'||typeof b.description!=='string'||typeof b.location!=='string'||
    !(b.preferred_date===null||typeof b.preferred_date==='string')||typeof b.expected_updated_at!=='string')
    return c.json({error:'Completa los datos de la solicitud antes de guardar.'},400);
  const title=b.title.trim(),description=b.description.trim(),location=b.location.trim();
  const preferredDate=typeof b.preferred_date==='string' ? b.preferred_date.trim() : '';
  if(title.length<3||title.length>180||description.length<6||description.length>3000||
    location.length>500||(preferredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)||
      !Number.isFinite(Date.parse(preferredDate+'T00:00:00Z')))))
    return c.json({error:'Asunto de 3 a 180 caracteres, descripción de 6 a 3000 y fecha válida (opcional).'},400);
  const old=await c.env.DB.prepare('SELECT id,customer_id,updated_at FROM requests WHERE id=?').bind(id).first<{id:string;customer_id:string;updated_at:string}>();
  if(!old)return c.json({error:'Solicitud no encontrada.'},404);
  if(old.updated_at!==b.expected_updated_at)
    return c.json({error:'La solicitud cambió desde que la abriste. Actualiza el listado antes de editarla.'},409);
  const now=new Date().toISOString();
  const changed=await c.env.DB.prepare(`UPDATE requests SET title=?,description=?,location=?,preferred_date=?,updated_at=?
    WHERE id=? AND updated_at=?`).bind(title,description,location,preferredDate||null,now,id,b.expected_updated_at).run();
  if(!changed.meta?.changes)return c.json({error:'La solicitud se modificó mientras la editabas. Actualiza el listado.'},409);
  await c.env.DB.prepare(`INSERT INTO audit_logs
    (id,admin_user_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,'request',?,?,?)`)
    .bind(crypto.randomUUID(),c.get('user')?.user_id||null,'request_details_updated',id,
      JSON.stringify({fields:['title','description','location','preferred_date']}),now).run();
  return c.json({message:'Solicitud editada.'});
});

// Eliminación permanente explícita: no borrar citas vinculadas ni dejar archivos sin gestionar.
adminCustomersRoutes.delete('/requests/:id', requireAdminAuth, async c => {
  const id=c.req.param('id');
  const existing=await c.env.DB.prepare('SELECT id,title,customer_id FROM requests WHERE id=?')
    .bind(id).first<{id:string;title:string;customer_id:string}>();
  if(!existing)return c.json({error:'Solicitud no encontrada.'},404);
  const linked=await c.env.DB.prepare('SELECT id FROM appointments WHERE request_id=? LIMIT 1').bind(id).first();
  if(linked)return c.json({error:'Esta solicitud tiene una cita vinculada. No se puede eliminar sin comprometer el historial; cancela la cita o conserva la solicitud.'},409);
  const imgs=await c.env.DB.prepare('SELECT r2_key FROM request_images WHERE request_id=?').bind(id).all<{r2_key:string}>();
  const now=new Date().toISOString();
  try {
    const result=await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM request_images WHERE request_id=?').bind(id),
      c.env.DB.prepare('DELETE FROM requests WHERE id=?').bind(id),
      c.env.DB.prepare(`INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at)
        VALUES (?,?,?,'request',?,?,?)`)
        .bind(crypto.randomUUID(),c.get('user')?.user_id||null,'request_deleted',id,
          JSON.stringify({title:existing.title,customer_id:existing.customer_id}),now),
    ]);
    if(!result[1].meta?.changes)return c.json({error:'Solicitud no encontrada.'},404);
  } catch(e) {
    if(/FOREIGN KEY|constraint/i.test(String(e)))
      return c.json({error:'Existen datos asociados a esta solicitud. Conserva el historial antes de eliminarla.'},409);
    throw e;
  }
  // La limpieza de los blobs ocurre DESPUÉS de confirmar la eliminación en D1.
  for(const img of imgs.results||[]){
    if(img.r2_key)await c.env.BUCKET.delete(img.r2_key).catch(e=>console.error('No se pudo limpiar archivo R2 de solicitud',id,e));
  }
  return c.json({message:'Solicitud eliminada definitivamente.'});
});

adminCustomersRoutes.get('/appointments', async c => {
  const {page,pageSize,q,advanced}=paging(c);
  const joins=' FROM appointments a LEFT JOIN customers cu ON cu.id = a.customer_id';
  const where = q ? ` WHERE instr(lower(a.id), ?) > 0
    OR instr(lower(a.title), ?) > 0
    OR instr(lower(COALESCE(cu.name,'')), ?) > 0
    OR instr(lower(COALESCE(cu.phone,'')), ?) > 0
    OR instr(lower(COALESCE(cu.email,'')), ?) > 0` : '';
  const args=q?[q,q,q,q,q]:[];
  const {results}=await c.env.DB.prepare(`SELECT a.id,a.title,a.starts_at,a.ends_at,a.status,
    cu.name AS customer_name,cu.phone,cu.email,cu.address,cu.city,cu.province`+joins+where+
    ' ORDER BY a.starts_at DESC LIMIT ? OFFSET ?')
    .bind(...args,advanced?pageSize:200,advanced?(page-1)*pageSize:0).all();
  if(!advanced)return c.json({appointments:results||[]});
  const total=await c.env.DB.prepare('SELECT COUNT(*) AS n'+joins+where).bind(...args).first<{n:number}>();
  return c.json({appointments:results||[],page,page_size:pageSize,total:total?.n||0});
});
adminCustomersRoutes.patch('/appointments/:id', async c => {
  const b=await c.req.json<any>().catch(()=>null);
  if(!b || !['pending','confirmed','in_progress','completed','cancelled'].includes(b.status))
    return c.json({error:'Estado inválido'},400);
  const id=c.req.param('id'),now=new Date().toISOString();
  const prior=await c.env.DB.prepare('SELECT customer_id,status,title,starts_at FROM appointments WHERE id=?')
    .bind(id).first<any>();
  if(!prior)return c.json({error:'Cita no encontrada'},404);
  if(prior.status===b.status)return c.json({message:'Sin cambios'});
  const changed=await c.env.DB.prepare('UPDATE appointments SET status=?,updated_at=? WHERE id=? AND status=?')
    .bind(b.status,now,id,prior.status).run();
  if(!changed.meta?.changes)return c.json({error:'La cita cambió. Actualiza el panel.'},409);
  if(prior.customer_id){
    try {
      const labels:Record<string,string>={pending:'pendiente',confirmed:'confirmada',in_progress:'en proceso',
        completed:'finalizada',cancelled:'cancelada'};
      await c.env.DB.prepare(`INSERT INTO notifications
        (id,user_id,user_type,type,title,message,is_read,created_at)
        VALUES (?,?,'customer','system',?,?,0,?)`).bind(
        crypto.randomUUID(),prior.customer_id,'Estado de tu cita',
        'Tu cita «'+prior.title+'» (ref. '+id+') está '+labels[b.status]+'.',now
      ).run();
    }catch(e){console.error('No se pudo avisar cambio de cita',e);}
  }
  return c.json({message:'Cita actualizada'});
});
