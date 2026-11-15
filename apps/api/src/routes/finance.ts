/**
 * Bonaire 4A — seguimiento económico privado. NO es contabilidad ni banco.
 * Declaraciones: fondos informados por cliente o condiciones conversadas.
 * Reportes: pago informado, NO VERIFICADO por defecto; solamente admin activo
 * puede consignar una revisión administrativa manual con evidencia descrita.
 * No modifica cotizaciones, contratos, cuentas ni estados de solicitudes.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';
import { validCubanWorkDate, cubaToday } from '../brigade-policy';

export const financeRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
financeRoutes.use('*',requireStaffAuth);

const isObject=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const only=(obj:Record<string,unknown>,names:string[]) =>
  Object.keys(obj).every(k=>names.includes(k));
const validId=(id:string|undefined):id is string=>
  typeof id==='string'&&id.length>0&&id.length<=128;
const money=(v:unknown):v is number =>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=99999999999;
const optionalMoney=(v:unknown):v is number|null|undefined =>
  v===null||v===undefined||money(v);
const str=(v:unknown,min:number,max:number):string|null =>
  typeof v==='string'&&v.length<=max+60&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
const option=(v:unknown,allowed:readonly string[]):v is string =>
  typeof v==='string'&&allowed.includes(v);
const validOptionalDay=(v:unknown):v is string|null|undefined =>
  v===undefined||v===null||v===''||(typeof v==='string'&&validCubanWorkDate(v));
const day=(v:unknown):v is string=>typeof v==='string'&&validCubanWorkDate(v);
const methods=['transfer','cash','card','mixed','other','undecided'];
const paymentMethods=['transfer','cash','card','mixed','other'];
const fundingStages=['not_confirmed','approval_pending','approval_reported','availability_reported'];
const sources=['customer_reported','terms_discussed'];
const evidence=['bank_statement','cash_count','provider_confirmation','other'];
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const isConflict=(e:unknown)=>/UNIQUE constraint|constraint failed|no se reescribe|no se elimina|Solo admin activo/i.test(errorMessage(e));
function audit(db:Env['DB'],actor:string,action:string,requestId:string,
  reportId:string,now:string,guard?:{status:string}){
  return db.prepare(
    "INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) "+
    "SELECT ?,?,?,'request',?,?,? FROM request_payment_reports "+
    "WHERE id=? AND (? IS NULL OR (verification_status=? AND updated_at=?))"
  ).bind(crypto.randomUUID(),actor,action,requestId,
    JSON.stringify({payment_report_id:reportId}),now,reportId,
    guard?.status??null,guard?.status??null,guard?now:null);
}
async function requestExists(env:Env,id:string){
  return !!await env.DB.prepare('SELECT id FROM requests WHERE id=?').bind(id).first();
}

// Cliente y gestor nunca acceden; los reportes aún sin verificar no se
// muestran en portales públicos ni generan facturas ni saldos de cobro.
financeRoutes.get('/requests/:requestId',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  if(!await requestExists(c.env,requestId))
    return c.json({error:'Solicitud inexistente.'},404);
  const [declarations,reports,totals]=await Promise.all([
    c.env.DB.prepare(
      'SELECT f.id,f.request_id,f.source,f.funding_stage,'+
      'f.approved_funds_declared_cents,f.available_funds_declared_cents,'+
      'f.advance_proposed_cents,f.payment_method,f.payment_deadline,'+
      'f.expected_payment_date,f.notes,f.created_at,au.email AS actor_email '+
      'FROM request_financial_declarations f JOIN admin_users au ON au.id=f.actor_id '+
      'WHERE f.request_id=? ORDER BY f.created_at DESC,f.id DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT p.id,p.request_id,p.amount_usd_cents,p.payment_method,'+
      'p.reported_on,p.reference,p.report_note,p.verification_status,'+
      'p.verification_basis,p.review_note,p.reviewed_at,p.created_at,'+
      'actor.email AS reported_by_email,reviewer.email AS reviewed_by_email '+
      'FROM request_payment_reports p '+
      'JOIN admin_users actor ON actor.id=p.reported_by '+
      'LEFT JOIN admin_users reviewer ON reviewer.id=p.reviewed_by '+
      'WHERE p.request_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT '+
      "COALESCE(SUM(CASE WHEN verification_status='reported' THEN amount_usd_cents ELSE 0 END),0) AS unverified_cents,"+
      "COALESCE(SUM(CASE WHEN verification_status='verified_manual' THEN amount_usd_cents ELSE 0 END),0) AS reviewed_manual_cents,"+
      "COUNT(*) AS report_count FROM request_payment_reports WHERE request_id=?"
    ).bind(requestId).first()
  ]);
  const d=declarations.results||[],p=reports.results||[];
  return c.json({
    request_id:requestId,declarations:d.slice(0,100),reports:p.slice(0,100),
    summary:totals||{unverified_cents:0,reviewed_manual_cents:0,report_count:0},
    truncated:{declarations:d.length>100,reports:p.length>100},
    note:'Saldos y pagos registrados internamente; no constituyen conciliación bancaria, comprobación automática ni acreditación jurídica.'
  });
});

financeRoutes.post('/requests/:requestId/declarations',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||!only(body,['source','funding_stage','approved_funds_declared_cents',
    'available_funds_declared_cents','advance_proposed_cents','payment_method',
    'payment_deadline','expected_payment_date','notes']))
    return c.json({error:'Campos de declaración económica no admitidos.'},400);
  const note=str(body.notes,3,1500);
  const moneyFields=['approved_funds_declared_cents','available_funds_declared_cents','advance_proposed_cents'] as const;
  if(!option(body.source,sources)||!option(body.funding_stage,fundingStages)||
     !option(body.payment_method,methods)||!note||
     !validOptionalDay(body.payment_deadline)||
     !validOptionalDay(body.expected_payment_date)||
     moneyFields.some(k=>!optionalMoney(body[k])))
    return c.json({error:'Indica fuente, etapa, moneda USD, forma, fechas e importes válidos.'},400);
  if(!await requestExists(c.env,requestId))
    return c.json({error:'Solicitud no encontrada.'},404);
  const id=crypto.randomUUID(),now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO request_financial_declarations '+
      '(id,request_id,actor_id,source,funding_stage,approved_funds_declared_cents,'+
      'available_funds_declared_cents,advance_proposed_cents,payment_method,'+
      'payment_deadline,expected_payment_date,notes,created_at) '+
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id,requestId,actor,body.source,body.funding_stage,
      body.approved_funds_declared_cents??null,
      body.available_funds_declared_cents??null,
      body.advance_proposed_cents??null,body.payment_method,
      body.payment_deadline||null,body.expected_payment_date||null,note,now),
    c.env.DB.prepare(
      'INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) '+
      "VALUES (?,?,?,'request',?,?,?)"
    ).bind(crypto.randomUUID(),actor,'funds_declaration_recorded',requestId,
      JSON.stringify({declaration_id:id}),now)
  ]);
  return c.json({id,request_id:requestId,
    message:'Declaración guardada; fondos y aprobaciones NO verificados.'},201);
});

financeRoutes.post('/requests/:requestId/payment-reports',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||!only(body,
    ['amount_usd_cents','payment_method','reported_on','reference','report_note']))
    return c.json({error:'Campos de reporte de pago no admitidos.'},400);
  const amount=body.amount_usd_cents,reference=body.reference===undefined||
    body.reference===null||body.reference===''?null:str(body.reference,4,80);
  const note=str(body.report_note,3,900);
  if(!money(amount)||amount===0||!option(body.payment_method,paymentMethods)||
     !day(body.reported_on)||body.reported_on>cubaToday()||
     !note||(reference===null&&body.reference!==undefined&&body.reference!==null&&body.reference!==''))
    return c.json({error:'Reporte inválido: importe positivo, fecha real, método y descripción obligatorios.'},400);
  if(!await requestExists(c.env,requestId))
    return c.json({error:'Solicitud no encontrada.'},404);
  const id=crypto.randomUUID(),now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  try{
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO request_payment_reports '+
        '(id,request_id,reported_by,amount_usd_cents,payment_method,reported_on,'+
        'reference,report_note,verification_status,created_at,updated_at) '+
        "VALUES (?,?,?,?,?,?,?,?,'reported',?,?)"
      ).bind(id,requestId,actor,amount,body.payment_method,body.reported_on,reference,note,now,now),
      c.env.DB.prepare(
        'INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) '+
        "VALUES (?,?,?,'request',?,?,?)"
      ).bind(crypto.randomUUID(),actor,'payment_reported_unverified',requestId,
        JSON.stringify({payment_report_id:id}),now)
    ]);
  }catch(e){
    if(isConflict(e))return c.json({error:'Ya existe un reporte con esa referencia para esta solicitud.'},409);
    throw e;
  }
  return c.json({id,status:'reported',
    message:'Pago REPORTADO. No consta verificación ni ingreso confirmado.'},201);
});

financeRoutes.patch('/payment-reports/:id/review',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Reporte inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||!only(body,
    ['decision','verification_basis','review_note','confirm_independent_check'])||
     !option(body.decision,['manual_verify','reject']))
    return c.json({error:'Revisión inválida.'},400);
  const verification=body.decision==='manual_verify';
  const note=str(body.review_note,verification?15:3,900);
  const basis=verification?body.verification_basis:null;
  if(!note||(verification&&(!option(basis,evidence)||body.confirm_independent_check!==true))||
     (!verification&&body.verification_basis!==undefined&&body.verification_basis!==null))
    return c.json({error:'Para registrar verificación manual confirma la comprobación independiente, su fuente y descripción detallada; para rechazar indica el motivo.'},400);
  const prior=await c.env.DB.prepare(
    'SELECT id,request_id,verification_status FROM request_payment_reports WHERE id=?'
  ).bind(id).first<{id:string;request_id:string;verification_status:string}>();
  if(!prior)return c.json({error:'Reporte no encontrado.'},404);
  if(prior.verification_status!=='reported')
    return c.json({error:'Este reporte ya fue revisado; no puede modificarse.'},409);
  const status=verification?'verified_manual':'rejected';
  const now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  try{
    const result=await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE request_payment_reports SET verification_status=?,reviewed_by=?,'+
        "reviewed_at=?,verification_basis=?,review_note=?,updated_at=? "+
        "WHERE id=? AND verification_status='reported'"
      ).bind(status,actor,now,basis,note,now,id),
      audit(c.env.DB,actor,'payment_review_'+status,prior.request_id,id,now,{status})
    ]);
    if(!result[0]?.meta?.changes)
      return c.json({error:'La revisión fue resuelta por otro administrador.'},409);
  }catch(e){
    if(isConflict(e))
      return c.json({error:'La revisión cambió, actualiza el expediente.'},409);
    throw e;
  }
  return c.json({status,message:verification
    ?'Comprobación ADMINISTRATIVA MANUAL registrada con fuente y responsable; no es conciliación bancaria automática.'
    :'Reporte rechazado con motivo, sin borrar el historial.'});
});
