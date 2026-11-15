/**
 * Portal del jefe de brigada. Sesiones independientes de clientes/admins.
 * Aislamiento por brigade_id comprobado en cada consulta y por triggers D1.
 * Fotografías en R2 PRIVADO, nunca en galería pública ni en request_images.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';
import { comparePassword, hashPassword } from '../auth';
import { currentChief, createChiefSession, requireChief, tokenDigest, type ChiefIdentity } from '../chief-auth';
import { rateLimited } from '../rate-limit';

type ChiefVars={chief?:ChiefIdentity;user?:any};
export const chiefRoutes=new Hono<{Bindings:Env;Variables:ChiefVars}>();
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const idValid=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
const str=(v:unknown,min:number,max:number):string|null=>
  typeof v==='string'&&v.length<=max+60&&v.trim().length>=min&&v.trim().length<=max?v.trim():null;
const allowed=(v:Record<string,unknown>,ks:string[])=>Object.keys(v).every(k=>ks.includes(k));
const emailValid=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const conflict=(e:unknown)=>/UNIQUE|constraint|Jefe no asignado|fuera de brigada|límite/i.test(
  e instanceof Error?e.message:String(e));
const reportTypes=['progress','incident','completion_proposed'];
const stages=['before','during','after'];
const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function audit(db:Env['DB'],adminId:string,action:string,entityId:string,details:unknown,now:string){
  return db.prepare(
    'INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) '+
    "VALUES (?,?,?,'brigade_chief',?,?,?)"
  ).bind(crypto.randomUUID(),adminId,action,entityId,JSON.stringify(details),now);
}

// ADMINISTRADOR: cuentas separadas, nunca contraseña o sesión en listados.
chiefRoutes.get('/admin/accounts',requireAdminAuth,async c=>{
  const {results}=await c.env.DB.prepare(
    'SELECT a.id,a.brigade_id,a.email,a.is_active,a.created_at,a.updated_at,'+
    'b.name AS brigade_name FROM brigade_chief_accounts a '+
    'JOIN brigades b ON b.id=a.brigade_id ORDER BY b.name LIMIT 200'
  ).all();
  return c.json({accounts:results||[]});
});
chiefRoutes.post('/admin/accounts',requireAdminAuth,async c=>{
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['brigade_id','email','password'])||
     !idValid(body.brigade_id)||typeof body.email!=='string'||typeof body.password!=='string')
    return c.json({error:'Brigada, correo y contraseña requeridos.'},400);
  const email=body.email.trim().toLowerCase();
  if(email.length>254||!emailValid(email)||body.password.length<12||body.password.length>128)
    return c.json({error:'Correo válido y contraseña de 12 a 128 caracteres.'},400);
  const b=await c.env.DB.prepare('SELECT id FROM brigades WHERE id=? AND is_active=1')
    .bind(body.brigade_id).first();
  if(!b)return c.json({error:'Brigada no encontrada o inactiva.'},404);
  // No reutilizar correo de cliente ni personal: identidades independientes.
  const [admin,customer]=await Promise.all([
    c.env.DB.prepare('SELECT id FROM admin_users WHERE LOWER(email)=?').bind(email).first(),
    c.env.DB.prepare('SELECT id FROM customers WHERE LOWER(email)=?').bind(email).first()
  ]);
  if(admin||customer)return c.json({error:'Correo ya usado por otro tipo de cuenta.'},409);
  const id=crypto.randomUUID(),now=new Date().toISOString(),actor=c.var.user!.user_id;
  const passwordHash=await hashPassword(body.password);
  try{
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO brigade_chief_accounts '+
        '(id,brigade_id,email,password_hash,is_active,created_by,created_at,updated_at) '+
        'VALUES (?,?,?,?,1,?,?,?)'
      ).bind(id,body.brigade_id,email,passwordHash,actor,now,now),
      audit(c.env.DB,actor,'chief_account_created',id,{brigade_id:body.brigade_id},now)
    ]);
  }catch(e){
    if(conflict(e))return c.json({error:'La brigada ya tiene cuenta de jefe o el correo está registrado.'},409);
    throw e;
  }
  return c.json({id,brigade_id:body.brigade_id,message:'Acceso del jefe creado; comparte las credenciales por un canal privado.'},201);
});
chiefRoutes.patch('/admin/accounts/:id',requireAdminAuth,async c=>{
  const id=c.req.param('id'),body=await c.req.json().catch(()=>null);
  if(!idValid(id)||!obj(body)||!allowed(body,['is_active','password','expected_updated_at'])||
     typeof body.expected_updated_at!=='string'||!body.expected_updated_at||
     (body.is_active===undefined&&body.password===undefined)||
     (body.is_active!==undefined&&typeof body.is_active!=='boolean')||
     (body.password!==undefined&&(typeof body.password!=='string'||body.password.length<12||body.password.length>128)))
    return c.json({error:'Modificación inválida. Requiere versión de la ficha actual.'},400);
  const old=await c.env.DB.prepare(
    'SELECT id,is_active,updated_at FROM brigade_chief_accounts WHERE id=?'
  ).bind(id).first<{id:string;is_active:number;updated_at:string}>();
  if(!old)return c.json({error:'Cuenta de jefe inexistente.'},404);
  if(old.updated_at!==body.expected_updated_at)
    return c.json({error:'Cuenta modificada por otro administrador. Actualiza la lista.'},409);
  const now=new Date().toISOString(),actor=c.var.user!.user_id;
  const passwordHash=typeof body.password==='string'?await hashPassword(body.password):null;
  const active=body.is_active===undefined?old.is_active:(body.is_active?1:0);
  const updates=[
    c.env.DB.prepare('UPDATE brigade_chief_accounts SET is_active=?,'+
      'password_hash=COALESCE(?,password_hash),updated_at=? '+
      'WHERE id=? AND updated_at=?'
    ).bind(active,passwordHash,now,id,old.updated_at),
    c.env.DB.prepare('UPDATE brigade_chief_sessions SET revoked_at=? WHERE chief_id=? AND revoked_at IS NULL')
      .bind(now,id),
    audit(c.env.DB,actor,'chief_account_changed',id,
      {is_active:Boolean(active),password_rotated:passwordHash!==null},now)
  ];
  const result=await c.env.DB.batch(updates);
  if(!result[0]?.meta?.changes)return c.json({error:'Cuenta cambiada. Actualiza.'},409);
  return c.json({message:'Cuenta actualizada; todas sus sesiones anteriores quedaron revocadas.'});
});

// LOGIN del jefe: token efímero 8 horas, sin acceso a las rutas administrativas.
chiefRoutes.post('/login',async c=>{
  if(await rateLimited(c.env,c.req.raw,'brigade_chief_login',8,900))
    return c.json({error:'Demasiados intentos. Inténtalo más tarde.'},429);
  const body=await c.req.json().catch(()=>null);
  const email=obj(body)&&typeof body.email==='string'?body.email.trim().toLowerCase():'';
  const password=obj(body)&&typeof body.password==='string'?body.password:'';
  if(!emailValid(email)||email.length>254||!password||password.length>128)
    return c.json({error:'Credenciales inválidas.'},401);
  const row=await c.env.DB.prepare(
    'SELECT a.id,a.brigade_id,a.email,a.password_hash FROM brigade_chief_accounts a '+
    'JOIN brigades b ON b.id=a.brigade_id WHERE LOWER(a.email)=? '+
    'AND a.is_active=1 AND b.is_active=1'
  ).bind(email).first<{id:string;brigade_id:string;email:string;password_hash:string}>();
  if(!row||!await comparePassword(password,row.password_hash))
    return c.json({error:'Credenciales inválidas.'},401);
  const token=await createChiefSession(c.env,row.id);
  return c.json({account:{id:row.id,brigade_id:row.brigade_id,email:row.email},
    ...token});
});
chiefRoutes.get('/me',requireChief,async c=>{
  const chief=c.var.chief!;
  const brigade=await c.env.DB.prepare('SELECT id,name,leader_name FROM brigades WHERE id=?')
    .bind(chief.brigade_id).first();
  return c.json({account:{id:chief.id,email:chief.email,brigade_id:chief.brigade_id},
    brigade});
});
chiefRoutes.post('/logout',requireChief,async c=>{
  const authorization=c.req.header('authorization')!;
  await c.env.DB.prepare(
    'UPDATE brigade_chief_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL'
  ).bind(new Date().toISOString(),await tokenDigest(authorization.slice(7))).run();
  return c.json({message:'Sesión del jefe finalizada.'});
});
chiefRoutes.get('/works',requireChief,async c=>{
  const chief=c.var.chief!;
  const rows=await c.env.DB.prepare(
    'SELECT w.id,w.title,w.work_date,w.estimated_minutes,w.status,'+
    'b.name AS brigade_name FROM brigade_work w '+
    'JOIN brigades b ON b.id=w.brigade_id '+
    'WHERE w.brigade_id=? AND w.status IN (\'scheduled\',\'completed\',\'pending_approval\',\'cancelled\') '+
    'ORDER BY w.work_date DESC,w.created_at DESC LIMIT 101'
  ).bind(chief.brigade_id).all();
  const work=rows.results||[];
  return c.json({works:work.slice(0,100),truncated:work.length>100,
    notice:'Acceso técnico limitado a la brigada. No incluye datos del cliente, contratos ni pagos.'});
});
chiefRoutes.get('/works/:id/reports',requireChief,async c=>{
  const id=c.req.param('id'),chief=c.var.chief!;
  if(!idValid(id))return c.json({error:'Trabajo inválido.'},400);
  const work=await c.env.DB.prepare('SELECT id FROM brigade_work WHERE id=? AND brigade_id=?')
    .bind(id,chief.brigade_id).first();
  if(!work)return c.json({error:'Trabajo ajeno o inexistente.'},404);
  const {results}=await c.env.DB.prepare(
    'SELECT id,work_id,report_type,summary,evidence_note,created_at '+
    'FROM brigade_chief_reports WHERE work_id=? AND chief_id=? '+
    'ORDER BY created_at DESC LIMIT 101'
  ).bind(id,chief.id).all();
  const rs=results||[];
  return c.json({reports:rs.slice(0,100),truncated:rs.length>100});
});
chiefRoutes.post('/works/:id/reports',requireChief,async c=>{
  const id=c.req.param('id'),chief=c.var.chief!;
  if(!idValid(id))return c.json({error:'Trabajo inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!obj(body)||!allowed(body,['report_type','summary','evidence_note']))
    return c.json({error:'Campos del informe no autorizados.'},400);
  const type=body.report_type,summary=str(body.summary,8,1500);
  const note=body.evidence_note===undefined||body.evidence_note===null||body.evidence_note===''?
    null:str(body.evidence_note,20,1200);
  if(!reportTypes.includes(String(type))||!summary||
     (body.evidence_note!==undefined&&body.evidence_note!==null&&body.evidence_note!==''&&!note)||
     (type==='completion_proposed'&&!note))
    return c.json({error:'Informe o evidencia incompletos.'},400);
  const work=await c.env.DB.prepare(
    "SELECT id FROM brigade_work WHERE id=? AND brigade_id=? AND status='scheduled'"
  ).bind(id,chief.brigade_id).first();
  if(!work)return c.json({error:'Solo puedes informar trabajos programados de tu brigada.'},404);
  const reportId=crypto.randomUUID(),now=new Date().toISOString();
  try{
    await c.env.DB.prepare(
      'INSERT INTO brigade_chief_reports '+
      '(id,work_id,chief_id,report_type,summary,evidence_note,created_at) '+
      'VALUES(?,?,?,?,?,?,?)'
    ).bind(reportId,id,chief.id,type,summary,note,now).run();
  }catch(e){
    if(conflict(e))return c.json({error:'El trabajo cambió; vuelve a cargar tus asignaciones.'},409);
    throw e;
  }
  return c.json({id:reportId,message:type==='completion_proposed'
    ?'Finalización INFORMADA por el jefe; requiere revisión administrativa independiente.'
    :'Informe del jefe registrado con identidad autenticada; no es una firma contractual.'},201);
});

const MAX_BYTES=5*1024*1024;
function imageCheck(file:File,bytes:Uint8Array){
  const mime=file.type;
  const jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return mime==='image/jpeg'&&jpg||mime==='image/png'&&png||mime==='image/webp'&&webp;
}
async function workEvidence(db:Env['DB'],workId:string,chiefId?:string){
  const select='SELECT id,work_id,report_id,stage,content_type,size_bytes,sha256_hex,captured_note,created_at '+
    'FROM brigade_evidence_images WHERE work_id=?';
  const query=chiefId?
    db.prepare(select+' AND chief_id=? ORDER BY created_at DESC LIMIT 101').bind(workId,chiefId):
    db.prepare(select+' ORDER BY created_at DESC LIMIT 101').bind(workId);
  const {results}=await query.all();
  const images=results||[];
  return {images:images.slice(0,100),truncated:images.length>100};
}
chiefRoutes.get('/works/:id/evidence',requireChief,async c=>{
  const id=c.req.param('id'),chief=c.var.chief!;
  if(!idValid(id))return c.json({error:'Trabajo inválido.'},400);
  const valid=await c.env.DB.prepare('SELECT id FROM brigade_work WHERE id=? AND brigade_id=?')
    .bind(id,chief.brigade_id).first();
  if(!valid)return c.json({error:'Trabajo ajeno.'},404);
  return c.json(await workEvidence(c.env.DB,id,chief.id));
});
chiefRoutes.post('/works/:id/evidence',requireChief,async c=>{
  const id=c.req.param('id'),chief=c.var.chief!;
  if(!idValid(id))return c.json({error:'Trabajo inválido.'},400);
  const work=await c.env.DB.prepare(
    "SELECT id FROM brigade_work WHERE id=? AND brigade_id=? AND status='scheduled'"
  ).bind(id,chief.brigade_id).first();
  if(!work)return c.json({error:'Solo los trabajos programados de tu brigada admiten nuevas fotos.'},404);
  const ct=c.req.header('content-type')||'';
  if(!ct.toLowerCase().startsWith('multipart/form-data'))
    return c.json({error:'Debes enviar una imagen desde el formulario.'},400);
  const declared=Number(c.req.header('content-length')||0);
  if(declared>MAX_BYTES+256*1024)return c.json({error:'La imagen supera el límite de 5 MB.'},413);
  const form=await c.req.formData().catch(()=>null);
  const file:unknown=form?.get('file');
  const stage=form?.get('stage');
  const noteRaw=form?.get('captured_note');
  const reportRaw=form?.get('report_id');
  const note=noteRaw===null||noteRaw===''?null:str(noteRaw,5,500);
  const reportId=reportRaw===null||reportRaw===''?null:reportRaw;
  if(!(file instanceof File)||file.size<1||file.size>MAX_BYTES||
     !stages.includes(String(stage))||(noteRaw!==null&&noteRaw!==''&&!note)||
     (reportId!==null&&!idValid(reportId))||!extensions[file.type])
    return c.json({error:'Archivo, etapa, nota o informe inválidos. JPG/PNG/WebP máximo 5 MB.'},400);
  const existing=await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM brigade_evidence_images WHERE work_id=?'
  ).bind(id).first<{n:number}>();
  if((existing?.n||0)>=12)return c.json({error:'Máximo 12 fotografías por trabajo.'},409);
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(!imageCheck(file,bytes))return c.json({error:'La imagen no coincide con el tipo indicado.'},400);
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  const imageId=crypto.randomUUID();
  const key='technical-evidence/'+id+'/'+imageId+'.'+extensions[file.type];
  // Guardado privado: un fallo en D1 elimina el archivo recién subido.
  await c.env.BUCKET.put(key,buffer,{httpMetadata:{contentType:file.type}});
  try{
    await c.env.DB.prepare(
      'INSERT INTO brigade_evidence_images '+
      '(id,work_id,chief_id,report_id,stage,r2_key,content_type,size_bytes,sha256_hex,captured_note,created_at) '+
      'VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(imageId,id,chief.id,reportId,stage,key,file.type,file.size,sha256,note,new Date().toISOString()).run();
  }catch(e){
    await c.env.BUCKET.delete(key).catch(()=>{});
    if(conflict(e))return c.json({error:'Trabajo, autor, informe o límite de fotos ya cambió.'},409);
    throw e;
  }
  return c.json({id:imageId,stage,sha256_hex:sha256,
    message:'Evidencia privada guardada. No es certificación ni firma técnica.'},201);
});
function renderPrivateImage(c:any,key:string){
  return c.env.BUCKET.get(key).then((o:any)=>{
    if(!o)return c.notFound();
    return c.body(o.body,200,{
      'Content-Type':o.httpMetadata?.contentType||'application/octet-stream',
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox",
      'Content-Disposition':'inline',
    });
  });
}
chiefRoutes.get('/works/:workId/evidence/:imageId',requireChief,async c=>{
  const chief=c.var.chief!,workId=c.req.param('workId'),imageId=c.req.param('imageId');
  if(!idValid(workId)||!idValid(imageId))return c.notFound();
  const pic=await c.env.DB.prepare(
    'SELECT img.r2_key FROM brigade_evidence_images img '+
    'JOIN brigade_work w ON w.id=img.work_id '+
    'WHERE img.id=? AND img.work_id=? AND img.chief_id=? AND w.brigade_id=?'
  ).bind(imageId,workId,chief.id,chief.brigade_id).first<{r2_key:string}>();
  return pic?renderPrivateImage(c,pic.r2_key):c.notFound();
});

// Administración y gestores ven fotos técnicas vinculadas a trabajos reales;
// no listan claves R2 y nunca comparten URLs públicas.
chiefRoutes.get('/staff/works/:id/evidence',requireStaffAuth,async c=>{
  const id=c.req.param('id');
  if(!idValid(id))return c.json({error:'Trabajo inválido.'},400);
  const exists=await c.env.DB.prepare('SELECT id FROM brigade_work WHERE id=?').bind(id).first();
  if(!exists)return c.json({error:'Trabajo inexistente.'},404);
  return c.json(await workEvidence(c.env.DB,id));
});
chiefRoutes.get('/staff/works/:workId/evidence/:imageId',requireStaffAuth,async c=>{
  const workId=c.req.param('workId'),imageId=c.req.param('imageId');
  if(!idValid(workId)||!idValid(imageId))return c.notFound();
  const pic=await c.env.DB.prepare(
    'SELECT r2_key FROM brigade_evidence_images WHERE id=? AND work_id=?'
  ).bind(imageId,workId).first<{r2_key:string}>();
  return pic?renderPrivateImage(c,pic.r2_key):c.notFound();
});
