/**
 * Bonaire — Agenda técnica por BRIGADAS, separada de citas comerciales.
 * Operaciones de gestores (admin/operator); la segunda asignación el mismo
 * día con >2 brigadas necesita APROBACIÓN de un administrador principal.
 *
 * Inserción y auditoría se ejecutan en un mismo D1.batch; la decisión de
 * ocupación se calcula dentro de un ÚNICO INSERT SQL para evitar lecturas
 * previas vulnerables a asignaciones simultáneas.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';
import { cubaToday, recommendBrigade, validCubanWorkDate, type BrigadeLoad } from '../brigade-policy';

export const brigadeWorkRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
brigadeWorkRoutes.use('*',requireStaffAuth);

const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const busyStates="'scheduled','pending_approval','completed'";
const monthValid=(s:string)=>/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(s);
function nextMonth(s:string){
  const [y,m]=s.split('-').map(Number);
  return new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
}
const audit=(db:Env['DB'],actor:string,action:string,id:string,details:Record<string,unknown>)=>
  db.prepare("INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at) SELECT ?,? ,?,'brigade_work',?, ?,? FROM brigade_work WHERE id=?")
    .bind(crypto.randomUUID(),actor,action,id,JSON.stringify(details),new Date().toISOString(),id);

function sqlConflict(error:unknown){
  return /constraint|la brigada tiene ocupaci|autoriza|UNIQUE/i.test(
    error instanceof Error?error.message:String(error));
}

brigadeWorkRoutes.get('/availability',async c=>{
  const date=c.req.query('date')||'';
  if(!validCubanWorkDate(date))return c.json({error:'Indica una fecha válida (AAAA-MM-DD) de Cuba.'},400);
  const month=date.slice(0,7),end=nextMonth(month);
  const rows=await c.env.DB.prepare(
    'SELECT b.id,b.name,b.is_active AS active,'+
    " (SELECT COUNT(*) FROM brigade_work w WHERE w.brigade_id=b.id AND w.work_date=? AND w.status IN ("+busyStates+')) AS day_jobs,'+
    " (SELECT COALESCE(SUM(w.estimated_minutes),0) FROM brigade_work w WHERE w.brigade_id=b.id AND w.work_date>=? AND w.work_date<? AND w.status IN ("+busyStates+')) AS planned_minutes,'+
    " (SELECT COUNT(*) FROM brigade_work w WHERE w.brigade_id=b.id AND w.work_date>=? AND w.work_date<? AND w.status IN ("+busyStates+')) AS jobs_in_period'+
    ' FROM brigades b WHERE b.is_active=1 ORDER BY b.name LIMIT 200'
  ).bind(date,month+'-01',end,month+'-01',end).all<BrigadeLoad>();
  const loads=(rows.results||[]).map(x=>({
    ...x,active:Boolean(x.active),day_jobs:Number(x.day_jobs),
    planned_minutes:Number(x.planned_minutes),jobs_in_period:Number(x.jobs_in_period)
  }));
  return c.json({date,brigades:loads,active_count:loads.length,
    recommended_brigade_id:recommendBrigade(loads)});
});

brigadeWorkRoutes.get('/month',async c=>{
  const month=c.req.query('month')||'';
  if(!monthValid(month))return c.json({error:'El mes debe usar el formato AAAA-MM.'},400);
  const rows=await c.env.DB.prepare(
    'SELECT w.id,w.brigade_id,b.name AS brigade_name,w.request_id,'+
    'r.title AS request_title,w.title,w.work_date,w.estimated_minutes,w.status,'+
    'w.busy_acknowledged,w.requested_by,requester.email AS requested_by_email,'+
    'w.reviewed_by,reviewer.email AS reviewed_by_email,w.reviewed_at,w.review_reason,'+
    'w.created_at,w.updated_at '+
    'FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id '+
    'JOIN requests r ON r.id=w.request_id '+
    'LEFT JOIN admin_users requester ON requester.id=w.requested_by '+
    'LEFT JOIN admin_users reviewer ON reviewer.id=w.reviewed_by '+
    'WHERE w.work_date>=? AND w.work_date<? ORDER BY w.work_date,w.created_at LIMIT 501'
  ).bind(month+'-01',nextMonth(month)).all();
  const results=rows.results||[];
  return c.json({month,works:results.slice(0,500),truncated:results.length>500});
});

brigadeWorkRoutes.get('/pending',requireAdminAuth,async c=>{
  const rows=await c.env.DB.prepare(
    "SELECT w.id,w.brigade_id,b.name AS brigade_name,w.request_id,w.title,w.work_date,w.estimated_minutes,w.status,w.created_at,requester.email AS requested_by_email "+
    "FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id "+
    "LEFT JOIN admin_users requester ON requester.id=w.requested_by "+
    "WHERE w.status='pending_approval' ORDER BY w.created_at ASC LIMIT 200"
  ).all();
  return c.json({pending:rows.results||[]});
});

// Gestión de la asignación por operadores/gestores. Se rechazan fechas anteriores
// al día de Cuba y solicitudes canceladas/completadas; NO cambia estado de solicitud.
brigadeWorkRoutes.post('/',async c=>{
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||Object.keys(body).some(x=>![
    'brigade_id','request_id','work_date','estimated_minutes','busy_acknowledged'
  ].includes(x)))return c.json({error:'Datos de asignación inválidos.'},400);
  const brigadeId=body.brigade_id,requestId=body.request_id,date=body.work_date;
  const duration=body.estimated_minutes===undefined?480:body.estimated_minutes;
  const acknowledged=body.busy_acknowledged===true;
  if(typeof brigadeId!=='string'||brigadeId.length<4||brigadeId.length>96||
     typeof requestId!=='string'||requestId.length<4||requestId.length>96||
     !validCubanWorkDate(date)||date<cubaToday()||
     !Number.isInteger(duration)||Number(duration)<30||Number(duration)>1440||
     (body.busy_acknowledged!==undefined&&typeof body.busy_acknowledged!=='boolean'))
    return c.json({error:'Brigada, solicitud, fecha futura o duración inválidas.'},400);
  const id=crypto.randomUUID(),now=new Date().toISOString(),actor=c.var.user!.user_id;
  const sql=
    'INSERT INTO brigade_work '+
    '(id,brigade_id,request_id,title,work_date,estimated_minutes,status,busy_acknowledged,requested_by,created_at,updated_at) '+
    "SELECT ?,b.id,r.id,substr(trim(r.title),1,180),?,?,"+
    "CASE WHEN (SELECT COUNT(*) FROM brigades WHERE is_active=1)>2 AND EXISTS ("+
    "SELECT 1 FROM brigade_work w WHERE w.brigade_id=b.id AND w.work_date=? AND w.status IN ("+busyStates+"))"+
    " THEN 'pending_approval' ELSE 'scheduled' END,?,?,?,? "+
    "FROM brigades b JOIN requests r ON r.id=? AND r.status NOT IN ('cancelled','completed') "+
    "WHERE b.id=? AND b.is_active=1 "+
    "AND ( ?=1 OR (SELECT COUNT(*) FROM brigades WHERE is_active=1)>2 "+
    "OR NOT EXISTS (SELECT 1 FROM brigade_work w WHERE w.brigade_id=b.id AND w.work_date=? AND w.status IN ("+busyStates+")))";
  try{
    const results=await c.env.DB.batch([
      c.env.DB.prepare(sql).bind(id,date,duration,date,acknowledged?1:0,actor,now,now,
        requestId,brigadeId,acknowledged?1:0,date),
      audit(c.env.DB,actor,'brigade_work_requested',id,{
        brigade_id:brigadeId,request_id:requestId,work_date:date,estimated_minutes:duration,
        busy_acknowledged:acknowledged
      })
    ]);
    if(!results[0]?.meta?.changes){
      return c.json({error:'Brigada no disponible o solicitud inexistente/cerrada. Si hay ocupación con una o dos brigadas, el gestor debe confirmarla.'},409);
    }
  }catch(e){
    if(sqlConflict(e))return c.json({error:'Ya existe una asignación o la ocupación cambió. Actualiza la agenda y revisa antes de continuar.'},409);
    throw e;
  }
  const row=await c.env.DB.prepare(
    'SELECT id,status,work_date,brigade_id,request_id,estimated_minutes FROM brigade_work WHERE id=?'
  ).bind(id).first<{id:string;status:string;work_date:string;brigade_id:string;request_id:string;estimated_minutes:number}>();
  return c.json({work:row,message:row?.status==='pending_approval'
    ?'Solicitud registrada; segundo trabajo PENDIENTE de autorización del administrador general.'
    :'Trabajo programado para la brigada.'},201);
});

brigadeWorkRoutes.patch('/:id/review',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!id)return c.json({error:'Identificador inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||Object.keys(body).some(k=>!['decision','reason'].includes(k))||
    !['approve','reject'].includes(String(body.decision)))
    return c.json({error:'Debes aprobar o rechazar la solicitud de autorización.'},400);
  const reason=body.reason===undefined?'':body.reason;
  if(typeof reason!=='string'||reason.length>500||
    (body.decision==='reject'&&reason.trim().length<3))
    return c.json({error:'Para rechazar, indica un motivo (3 a 500 caracteres).'},400);
  const actor=c.var.user!.user_id,now=new Date().toISOString();
  const status=body.decision==='approve'?'scheduled':'rejected';
  try{
    const result=await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE brigade_work SET status=?,reviewed_by=?,reviewed_at=?,review_reason=?,updated_at=? "+
        "WHERE id=? AND status='pending_approval'"
      ).bind(status,actor,now,reason.trim()||null,now,id),
      audit(c.env.DB,actor,'brigade_work_'+status,id,{status,reason:reason.trim()})
    ]);
    if(!result[0]?.meta?.changes)return c.json({error:'Autorización inexistente o ya resuelta.'},409);
  }catch(e){
    if(sqlConflict(e))return c.json({error:'La ocupación cambió y la asignación necesita nueva revisión.'},409);
    throw e;
  }
  return c.json({status,message:status==='scheduled'?'Segundo trabajo autorizado.':'Segundo trabajo rechazado.'});
});

brigadeWorkRoutes.patch('/:id/cancel',async c=>{
  const id=c.req.param('id');
  if(!id)return c.json({error:'Identificador inválido.'},400);
  const body=await c.req.json().catch(()=>({}));
  if(!isObject(body)||Object.keys(body).some(x=>x!=='reason')||
     (body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500)))
    return c.json({error:'Motivo de cancelación inválido.'},400);
  const actor=c.var.user!.user_id,now=new Date().toISOString();
  const results=await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE brigade_work SET status='cancelled',updated_at=? WHERE id=? AND status IN ('scheduled','pending_approval')"
    ).bind(now,id),
    audit(c.env.DB,actor,'brigade_work_cancelled',id,
      {reason:typeof body.reason==='string'?body.reason.trim():''})
  ]);
  if(!results[0]?.meta?.changes)return c.json({error:'Trabajo inexistente, cancelado o cerrado.'},409);
  return c.json({status:'cancelled',message:'Trabajo cancelado; historial conservado.'});
});
