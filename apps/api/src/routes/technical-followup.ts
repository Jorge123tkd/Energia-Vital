/**
 * Bonaire 5A — seguimiento técnico y posventa internos.
 * Los jefes de brigada no tienen credenciales propias en esta etapa:
 * el personal registra si observó un hecho o RELATA lo informado por el jefe.
 * No se generan certificados, firmas, garantías aprobadas ni pagos.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';

export const technicalRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
technicalRoutes.use('*',requireStaffAuth);
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const allowed=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).every(k=>keys.includes(k));
const validId=(s:string|undefined):s is string=>typeof s==='string'&&s.length>0&&s.length<=128;
const txt=(v:unknown,min:number,max:number):string|null=>
  typeof v==='string'&&v.length<=max+40&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
const choose=(v:unknown,opts:readonly string[]):v is string=>
  typeof v==='string'&&opts.includes(v);
const sqlConflict=(err:unknown)=>/constraint|historial|mismo|informe|revisión|revisar|cerrar|finaliz|exige|aceptado|UNIQUE/i.test(
  err instanceof Error?err.message:String(err));
function log(db:Env['DB'],actor:string,action:string,requestId:string,id:string,details:Record<string,unknown>,
  condition:{table:'technical_work_reports'|'service_followup_cases';column:'created_at'|'reviewed_at'|'resolved_at';time:string}){
  const {table,column,time}=condition;
  return db.prepare("INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at) "+
    "SELECT ?,?,?,'request',?,?,? FROM "+table+" WHERE id=? AND "+column+"=?"
  ).bind(crypto.randomUUID(),actor,action,requestId,JSON.stringify({id,...details}),
    time,id,time);
}

technicalRoutes.get('/requests/:requestId',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  const request=await c.env.DB.prepare('SELECT id FROM requests WHERE id=?')
    .bind(requestId).first();
  if(!request)return c.json({error:'Solicitud inexistente.'},404);
  const [jobs,reports,cases,notes,images]=await Promise.all([
    c.env.DB.prepare(
      'SELECT w.id,w.request_id,w.title,w.work_date,w.estimated_minutes,w.status,'+
      'b.name AS brigade_name,b.leader_name AS brigade_chief_name '+
      'FROM brigade_work w JOIN brigades b ON b.id=w.brigade_id '+
      'WHERE w.request_id=? ORDER BY w.work_date DESC,w.created_at DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT tr.id,tr.work_id,tr.report_type,tr.information_source,tr.summary,tr.evidence_note,'+
      'tr.evidence_image_id,tr.review_status,tr.review_note,tr.reviewed_at,tr.created_at,'+
      'actor.email AS actor_email,reviewer.email AS reviewer_email '+
      'FROM technical_work_reports tr JOIN brigade_work w ON w.id=tr.work_id '+
      'JOIN admin_users actor ON actor.id=tr.actor_id '+
      'LEFT JOIN admin_users reviewer ON reviewer.id=tr.reviewed_by '+
      'WHERE w.request_id=? ORDER BY tr.created_at DESC,tr.id DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT sc.id,sc.request_id,sc.work_id,sc.case_type,sc.priority,sc.title,'+
      'sc.description,sc.warranty_claim_details,sc.status,sc.created_at,sc.resolved_at,'+
      'sc.resolution_note,opener.email AS opened_by_email,closer.email AS resolved_by_email '+
      'FROM service_followup_cases sc JOIN admin_users opener ON opener.id=sc.opened_by '+
      'LEFT JOIN admin_users closer ON closer.id=sc.resolved_by '+
      'WHERE sc.request_id=? ORDER BY sc.created_at DESC,sc.id DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT sn.id,sn.case_id,sn.note,sn.created_at,actor.email AS actor_email '+
      'FROM service_case_notes sn JOIN service_followup_cases sc ON sc.id=sn.case_id '+
      'JOIN admin_users actor ON actor.id=sn.actor_id '+
      'WHERE sc.request_id=? ORDER BY sn.created_at DESC,sn.id DESC LIMIT 101'
    ).bind(requestId).all(),
    c.env.DB.prepare(
      'SELECT id,created_at FROM request_images WHERE request_id=? '+
      'ORDER BY created_at DESC LIMIT 101'
    ).bind(requestId).all()
  ]);
  const ws=jobs.results||[],rp=reports.results||[],cs=cases.results||[],
    ns=notes.results||[],imgs=images.results||[];
  return c.json({request_id:requestId,works:ws.slice(0,100),reports:rp.slice(0,100),
    cases:cs.slice(0,100),notes:ns.slice(0,100),evidence_images:imgs.slice(0,100),
    truncated:{works:ws.length>100,reports:rp.length>100,cases:cs.length>100,
      notes:ns.length>100,evidence_images:imgs.length>100},
    notice:'Las fotos existentes pueden ser anteriores al trabajo. Una nota o foto no es comprobación de ejecución ni aceptación de garantía.'});
});

technicalRoutes.post('/works/:id/reports',async c=>{
  const workId=c.req.param('id');
  if(!validId(workId))return c.json({error:'Trabajo inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['report_type','information_source','summary',
    'evidence_note','evidence_image_id']))
    return c.json({error:'Datos de informe no admitidos.'},400);
  const type=body.report_type,source=body.information_source,
    summary=txt(body.summary,8,1500);
  const ev=body.evidence_note===undefined||body.evidence_note===null||
    body.evidence_note===''?null:txt(body.evidence_note,20,1200);
  const image=body.evidence_image_id===undefined||body.evidence_image_id===null||
    body.evidence_image_id===''?null:body.evidence_image_id;
  if(!choose(type,['progress','incident','completion_proposed'])||
     !choose(source,['staff_observed','chief_relayed'])||!summary||
     (body.evidence_note!==undefined&&body.evidence_note!==null&&
      body.evidence_note!==''&&!ev)||
     (type==='completion_proposed'&&!ev)||
     (image!==null&&(!validId(image))))
    return c.json({error:'Tipo, origen, descripción o evidencia inválidos.'},400);
  const work=await c.env.DB.prepare(
    'SELECT id,request_id,status FROM brigade_work WHERE id=?'
  ).bind(workId).first<{id:string;request_id:string;status:string}>();
  if(!work)return c.json({error:'Trabajo inexistente.'},404);
  if(work.status!=='scheduled')
    return c.json({error:'Solo se puede informar sobre trabajos programados y autorizados.'},409);
  const id=crypto.randomUUID(),now=new Date().toISOString(),
    actor=c.var.user!.user_id as string,status=type==='completion_proposed'?'pending_review':'note_only';
  try{
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO technical_work_reports '+
        '(id,work_id,actor_id,report_type,information_source,summary,evidence_note,'+
        'evidence_image_id,review_status,created_at) '+
        'VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).bind(id,workId,actor,type,source,summary,ev,image,status,now),
      log(c.env.DB,actor,'technical_report_logged',work.request_id,id,
        {work_id:workId,report_type:type,review_status:status},
        {table:'technical_work_reports',column:'created_at',time:now})
    ]);
  }catch(e){
    if(sqlConflict(e))return c.json({error:'El trabajo cambió, ya existe una propuesta pendiente o la fotografía no pertenece a esta solicitud.'},409);
    throw e;
  }
  return c.json({id,work_id:workId,status,
    message:status==='pending_review'
      ?'Propuesta de finalización registrada; el trabajo sigue programado hasta revisión del administrador.'
      :'Informe técnico registrado como declaración interna; no se certificó el trabajo.'},201);
});

technicalRoutes.patch('/reports/:id/review',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Informe inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['decision','review_note','confirm_technical_evidence'])||
     !choose(body.decision,['accept','reject']))
    return c.json({error:'Decisión inválida.'},400);
  const accepted=body.decision==='accept';
  const note=txt(body.review_note,accepted?12:3,1000);
  if(!note||(accepted&&body.confirm_technical_evidence!==true))
    return c.json({error:'Indica la revisión técnica y confirma la evidencia antes de cerrar.'},400);
  const report=await c.env.DB.prepare(
    'SELECT tr.id,tr.work_id,tr.review_status,w.request_id,w.status AS work_status '+
    'FROM technical_work_reports tr JOIN brigade_work w ON w.id=tr.work_id '+
    'WHERE tr.id=?'
  ).bind(id).first<{id:string;work_id:string;review_status:string;
    request_id:string;work_status:string}>();
  if(!report)return c.json({error:'Informe inexistente.'},404);
  if(report.review_status!=='pending_review'||report.work_status!=='scheduled')
    return c.json({error:'Informe ya revisado o trabajo no programado.'},409);
  const actor=c.var.user!.user_id as string,now=new Date().toISOString(),
    status=accepted?'accepted':'rejected';
  try{
    const statements=[
      c.env.DB.prepare(
        "UPDATE technical_work_reports SET review_status=?,reviewed_by=?,reviewed_at=?,review_note=? "+
        "WHERE id=? AND review_status='pending_review' AND EXISTS ("+
        "SELECT 1 FROM brigade_work w WHERE w.id=work_id AND w.status='scheduled')"
      ).bind(status,actor,now,note,id)
    ];
    if(accepted){
      statements.push(c.env.DB.prepare(
        "UPDATE brigade_work SET status='completed',updated_at=? "+
        "WHERE id=? AND status='scheduled' AND EXISTS ("+
        "SELECT 1 FROM technical_work_reports tr WHERE tr.id=? AND tr.work_id=brigade_work.id "+
        "AND tr.review_status='accepted' AND tr.reviewed_by=? AND tr.reviewed_at=?)"
      ).bind(now,report.work_id,id,actor,now));
    }
    statements.push(log(c.env.DB,actor,
      accepted?'technical_work_completed':'technical_completion_rejected',
      report.request_id,id,{work_id:report.work_id,decision:status},
      {table:'technical_work_reports',column:'reviewed_at',time:now}));
    const results=await c.env.DB.batch(statements);
    if(!results[0]?.meta?.changes||accepted&&!results[1]?.meta?.changes)
      return c.json({error:'El informe o la asignación cambió; actualiza el expediente.'},409);
  }catch(e){
    if(sqlConflict(e))return c.json({error:'La revisión cambió o la evidencia ya no es válida; actualiza el expediente.'},409);
    throw e;
  }
  return c.json({status,work_status:accepted?'completed':'scheduled',
    message:accepted
      ?'Cierre técnico aprobado por administración. La solicitud comercial y los pagos no se han modificado.'
      :'Propuesta de finalización rechazada; conserva la asignación y su historial.'});
});

technicalRoutes.post('/requests/:requestId/cases',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['work_id','case_type','priority','title',
    'description','warranty_claim_details']))
    return c.json({error:'Datos de incidencia no admitidos.'},400);
  const workId=body.work_id===undefined||body.work_id===null||body.work_id===''?
    null:body.work_id;
  const type=body.case_type,priority=body.priority??'medium',
    title=txt(body.title,3,180),description=txt(body.description,8,1500);
  const warranty=body.warranty_claim_details===undefined||body.warranty_claim_details===null||
    body.warranty_claim_details===''?null:txt(body.warranty_claim_details,3,1000);
  if(!choose(type,['incident','warranty_claim','post_sale_followup'])||
     !choose(priority,['low','medium','high','urgent'])||!title||!description||
     (workId!==null&&!validId(workId))||
     (body.warranty_claim_details!==undefined&&body.warranty_claim_details!==null&&
      body.warranty_claim_details!==''&&!warranty))
    return c.json({error:'Datos de incidencia o reclamación inválidos.'},400);
  const request=await c.env.DB.prepare('SELECT id FROM requests WHERE id=?')
    .bind(requestId).first();
  if(!request)return c.json({error:'Solicitud inexistente.'},404);
  const id=crypto.randomUUID(),now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  try{
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO service_followup_cases '+
        '(id,request_id,work_id,case_type,priority,title,description,'+
        'warranty_claim_details,status,opened_by,created_at,updated_at) '+
        "VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)"
      ).bind(id,requestId,workId,type,priority,title,description,warranty,actor,now,now),
      log(c.env.DB,actor,'service_case_opened',requestId,id,
        {case_type:type,work_id:workId},
        {table:'service_followup_cases',column:'created_at',time:now})
    ]);
  }catch(e){
    if(sqlConflict(e))return c.json({error:'El trabajo elegido no pertenece a esta solicitud.'},409);
    throw e;
  }
  return c.json({id,status:'open',
    message:type==='warranty_claim'
      ?'Reclamación recibida sin aceptación automática de cobertura o responsabilidad.'
      :'Caso técnico de seguimiento registrado.'},201);
});

technicalRoutes.post('/cases/:id/notes',async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Caso inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['note']))return c.json({error:'Campos de nota inválidos.'},400);
  const note=txt(body.note,5,1000);
  if(!note)return c.json({error:'Nota de 5 a 1000 caracteres requerida.'},400);
  const caseRow=await c.env.DB.prepare(
    'SELECT id,request_id,status FROM service_followup_cases WHERE id=?'
  ).bind(id).first<{id:string;request_id:string;status:string}>();
  if(!caseRow)return c.json({error:'Caso inexistente.'},404);
  if(caseRow.status!=='open')return c.json({error:'El caso ya fue cerrado; no se añaden notas.'},409);
  const actor=c.var.user!.user_id as string,now=new Date().toISOString(),noteId=crypto.randomUUID();
  const results=await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO service_case_notes(id,case_id,actor_id,note,created_at) "+
      "SELECT ?,id,?,?,? FROM service_followup_cases WHERE id=? AND status='open'"
    ).bind(noteId,actor,note,now,id),
    c.env.DB.prepare(
      "INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at) "+
      "SELECT ?,?,'service_case_note_added','request',?,?,? FROM service_case_notes WHERE id=?"
    ).bind(crypto.randomUUID(),actor,caseRow.request_id,
      JSON.stringify({case_id:id,note_id:noteId}),now,noteId)
  ]);
  if(!results[0]?.meta?.changes)return c.json({error:'El caso fue cerrado antes de guardar.'},409);
  return c.json({id:noteId,message:'Nota de seguimiento registrada con responsable.'},201);
});

technicalRoutes.patch('/cases/:id/resolve',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Caso inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['resolution_note','confirm_review']))
    return c.json({error:'Campos de cierre inválidos.'},400);
  const note=txt(body.resolution_note,12,1000);
  if(!note||body.confirm_review!==true)
    return c.json({error:'El cierre necesita una revisión confirmada y una nota de al menos 12 caracteres.'},400);
  const row=await c.env.DB.prepare(
    'SELECT id,request_id,status FROM service_followup_cases WHERE id=?'
  ).bind(id).first<{id:string;request_id:string;status:string}>();
  if(!row)return c.json({error:'Caso inexistente.'},404);
  if(row.status!=='open')return c.json({error:'Caso ya resuelto.'},409);
  const now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  try{
    const results=await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE service_followup_cases SET status='resolved',resolved_by=?,"+
        "resolved_at=?,resolution_note=?,updated_at=? WHERE id=? AND status='open'"
      ).bind(actor,now,note,now,id),
      log(c.env.DB,actor,'service_case_resolved',row.request_id,id,
        {resolution:'resolved'}, {table:'service_followup_cases',column:'resolved_at',time:now})
    ]);
    if(!results[0]?.meta?.changes)return c.json({error:'El caso ya fue resuelto.'},409);
  }catch(e){
    if(sqlConflict(e))return c.json({error:'El caso cambió y no se pudo completar el cierre.'},409);
    throw e;
  }
  return c.json({status:'resolved',
    message:'Cierre administrativo registrado, sin aceptación automática de garantía ni modificación de cobros.'});
});
