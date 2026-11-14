/**
 * Expediente Bonaire 360°: vista PRIVADA sobre datos existentes +
 * bitácora INMUTABLE de intervenciones del equipo.
 * No duplica clientes ni solicitudes. No autoriza pagos ni cotizaciones.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireStaffAuth } from '../middleware';
import { validCubanWorkDate } from '../brigade-policy';

export const dossierRoutes = new Hono<{Bindings:Env;Variables:{user?:any}}>();
dossierRoutes.use('*',requireStaffAuth);

const object=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const activityTypes=['call','whatsapp','visit','follow_up','internal_note'] as const;
const idValid=(s:string)=>s.length>0&&s.length<=128;
const text=(v:unknown,max:number):string|null=>
  typeof v==='string'&&v.length<=max+50&&v.trim().length<=max?v.trim():null;

dossierRoutes.get('/customers/:id',async c=>{
  const id=c.req.param('id');
  if(!id||!idValid(id))return c.json({error:'Cliente inválido.'},400);
  // No SELECT *: excluir password_hash, teléfono/verificaciones internos,
  // tokens de Telegram, notas de asistentes y demás credenciales.
  const customer=await c.env.DB.prepare(
    'SELECT id,name,email,phone,address,city,province,is_active,created_at,updated_at '+
    'FROM customers WHERE id=?'
  ).bind(id).first();
  if(!customer)return c.json({error:'Cliente no encontrado.'},404);
  const [requests,appointments,activities,works,assistant]=await Promise.all([
    c.env.DB.prepare(
      'SELECT r.id,r.title,r.type,r.status,r.priority,r.location,r.preferred_date,'+
      'r.created_at,r.updated_at,ri.available_budget_usd_cents,ri.payment_method,'+
      'ri.payment_currency,ri.customer_type,'+
      '(SELECT COUNT(*) FROM request_images im WHERE im.request_id=r.id) AS image_count '+
      'FROM requests r LEFT JOIN request_intake ri ON ri.request_id=r.id '+
      'WHERE r.customer_id=? ORDER BY r.created_at DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT a.id,a.request_id,a.title,a.starts_at,a.ends_at,a.status,a.created_at '+
      'FROM appointments a WHERE a.customer_id=? '+
      'ORDER BY a.starts_at DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT ac.id,ac.request_id,r.title AS request_title,ac.activity_type,'+
      'ac.note,ac.next_step,ac.follow_up_date,ac.created_at,au.email AS actor_email '+
      'FROM request_activities ac JOIN requests r ON r.id=ac.request_id '+
      'JOIN admin_users au ON au.id=ac.actor_id '+
      'WHERE r.customer_id=? ORDER BY ac.created_at DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT w.id,w.request_id,w.title,w.work_date,w.status,w.estimated_minutes,'+
      'b.name AS brigade_name FROM brigade_work w '+
      'JOIN requests r ON r.id=w.request_id JOIN brigades b ON b.id=w.brigade_id '+
      'WHERE r.customer_id=? ORDER BY w.work_date DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS conversations FROM assistant_sessions '+
      'WHERE customer_id=?'
    ).bind(id).first<{conversations:number}>()
  ]);
  const rs=requests.results||[],ap=appointments.results||[],
    ac=activities.results||[],ws=works.results||[];
  return c.json({
    customer,
    requests:rs.slice(0,100),appointments:ap.slice(0,100),
    activities:ac.slice(0,100),works:ws.slice(0,100),
    assistant_conversations_count:assistant?.conversations??0,
    // El contenido de chats se mantiene PRIVADO. No se fusiona ni se
    // atribuye a este cliente por coincidencia de teléfono o nombre.
    truncated:{requests:rs.length>100,appointments:ap.length>100,
      activities:ac.length>100,works:ws.length>100}
  });
});

dossierRoutes.get('/requests/:id',async c=>{
  const id=c.req.param('id');
  if(!id||!idValid(id))return c.json({error:'Solicitud inválida.'},400);
  const request=await c.env.DB.prepare(
    'SELECT r.id,r.customer_id,r.type,r.request_category_id,r.title,r.description,'+
    'r.status,r.priority,r.location,r.preferred_date,r.created_at,r.updated_at,'+
    'ri.available_budget_usd_cents,ri.payment_method,ri.payment_currency,ri.customer_type,'+
    'cu.name AS customer_name,cu.email AS customer_email,cu.phone AS customer_phone,'+
    'cu.address AS customer_address,cu.city AS customer_city,cu.province AS customer_province,'+
    '(SELECT COUNT(*) FROM request_images im WHERE im.request_id=r.id) AS image_count '+
    'FROM requests r LEFT JOIN request_intake ri ON ri.request_id=r.id '+
    'LEFT JOIN customers cu ON cu.id=r.customer_id WHERE r.id=?'
  ).bind(id).first();
  if(!request)return c.json({error:'Solicitud no encontrada.'},404);
  const [activities,works,appointments,audits]=await Promise.all([
    c.env.DB.prepare(
      'SELECT ac.id,ac.request_id,ac.activity_type,ac.note,ac.next_step,'+
      'ac.follow_up_date,ac.created_at,au.email AS actor_email '+
      'FROM request_activities ac JOIN admin_users au ON au.id=ac.actor_id '+
      'WHERE ac.request_id=? ORDER BY ac.created_at DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT w.id,w.title,w.work_date,w.estimated_minutes,w.status,'+
      'b.name AS brigade_name,requester.email AS requested_by_email,'+
      'reviewer.email AS reviewed_by_email,w.reviewed_at,w.review_reason '+
      'FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id '+
      'LEFT JOIN admin_users requester ON requester.id=w.requested_by '+
      'LEFT JOIN admin_users reviewer ON reviewer.id=w.reviewed_by '+
      'WHERE w.request_id=? ORDER BY w.work_date DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      'SELECT id,title,starts_at,ends_at,status,notes,technician_notes '+
      'FROM appointments WHERE request_id=? ORDER BY starts_at DESC LIMIT 101'
    ).bind(id).all(),
    c.env.DB.prepare(
      "SELECT a.id,a.action,a.created_at,au.email AS actor_email "+
      "FROM audit_logs a LEFT JOIN admin_users au ON au.id=a.admin_user_id "+
      "WHERE a.entity_type='request' AND a.entity_id=? "+
      "ORDER BY a.created_at DESC LIMIT 101"
    ).bind(id).all()
  ]);
  const ac=activities.results||[],ws=works.results||[],
    ap=appointments.results||[],au=audits.results||[];
  return c.json({
    request,
    activities:ac.slice(0,100),works:ws.slice(0,100),
    appointments:ap.slice(0,100),audit:au.slice(0,100),
    truncated:{activities:ac.length>100,works:ws.length>100,
      appointments:ap.length>100,audit:au.length>100}
  });
});

// Gestores con acceso a cualquier solicitud: la atribución al autor
// es OBLIGATORIA. Nadie puede introducir un actor_id arbitrario ni editar
// actuaciones guardadas. La cuenta siempre procede del JWT verificado.
dossierRoutes.post('/requests/:id/activities',async c=>{
  const requestId=c.req.param('id');
  if(!requestId||!idValid(requestId))
    return c.json({error:'Solicitud inválida.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!object(body)||Object.keys(body).some(k=>
     !['activity_type','note','next_step','follow_up_date'].includes(k)))
    return c.json({error:'Campos de gestión no autorizados.'},400);
  const type=body.activity_type;
  const note=text(body.note,1500);
  const next=body.next_step===undefined||body.next_step===null?null:text(body.next_step,280);
  const due=body.follow_up_date===undefined||body.follow_up_date===null||
    body.follow_up_date===''?null:body.follow_up_date;
  if(typeof type!=='string'||!activityTypes.includes(type as typeof activityTypes[number])||
    !note||note.length<3||(next===null&&body.next_step!==null&&body.next_step!==undefined)||
    (due!==null&&!validCubanWorkDate(due)))
    return c.json({error:'Tipo, resumen, próxima acción o fecha inválidos.'},400);
  const exists=await c.env.DB.prepare('SELECT id FROM requests WHERE id=?')
    .bind(requestId).first();
  if(!exists)return c.json({error:'Solicitud no encontrada.'},404);
  const actor=c.var.user!.user_id as string;
  const id=crypto.randomUUID(),now=new Date().toISOString();
  // Un único D1.batch conserva la actividad y su auditoría juntas.
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO request_activities '+
      '(id,request_id,actor_id,activity_type,note,next_step,follow_up_date,created_at) '+
      'VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id,requestId,actor,type,note,next||null,due,now),
    c.env.DB.prepare(
      'INSERT INTO audit_logs '+
      '(id,admin_user_id,action,entity_type,entity_id,details,created_at) '+
      "VALUES (?,?,?,'request',?,?,?)"
    ).bind(crypto.randomUUID(),actor,'commercial_activity_logged',requestId,
      JSON.stringify({activity_id:id,activity_type:type}),now)
  ]);
  return c.json({id,request_id:requestId,activity_type:type,created_at:now,
    message:'Gestión guardada con identificación del responsable.'},201);
});
