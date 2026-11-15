/**
 * Cotizaciones Bonaire — gestión interna, sin envío o emisión al cliente.
 * Borrador -> revisión -> aprobación interna/rechazo por administrador activo.
 * Cada versión es un snapshot inmutable; las correcciones crean otra versión.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';
import { validCubanWorkDate, cubaToday } from '../brigade-policy';

export const quoteRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
quoteRoutes.use('*',requireStaffAuth);
type Item={description:string;quantity:number;unit_price_usd_cents:number;
  line_total_usd_cents:number};
type QuoteInput={
  title:string;items:Item[];subtotal_cents:number;taxes_cents:number;
  freight_cents:number;discount_cents:number;total_cents:number;
  valid_until:string|null;delivery_terms:string|null;warranty_terms:string|null;
  payment_terms:string|null;stock_notes:string|null;tax_notes:string|null;
  freight_notes:string|null;internal_notes:string|null;
};
const isObject=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const maxCents=99999999999;
const errorMessage=(e:unknown):string => e instanceof Error?e.message:String(e);
const conflict=(e:unknown):boolean =>
  /UNIQUE constraint|constraint failed|cotizacion|cotización|transicion|transición/i.test(errorMessage(e));
const textField=(v:unknown,max:number,nullable=true):string|null|undefined=>{
  if(v===undefined||v===null||v===''){
    return nullable?null:undefined;
  }
  if(typeof v!=='string'||v.length>max+50)return undefined;
  const s=v.trim();
  if(s.length>max)return undefined;
  return s||null;
};
const cents=(v:unknown):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=maxCents;
const validId=(id:string|undefined)=>typeof id==='string'&&id.length>0&&id.length<=128;

function validate(body:unknown):{data?:QuoteInput;error?:string}{
  const keys=['title','items','taxes_usd_cents','freight_usd_cents','discount_usd_cents',
    'valid_until','delivery_terms','warranty_terms','payment_terms','stock_notes',
    'tax_notes','freight_notes','internal_notes','expected_latest_id'];
  if(!isObject(body)||Object.keys(body).some(k=>!keys.includes(k)))
    return {error:'La cotización contiene campos no admitidos.'};
  const title=textField(body.title,180,false);
  if(!title||title.length<3)return {error:'El asunto debe tener 3–180 caracteres.'};
  if(!Array.isArray(body.items)||body.items.length<1||body.items.length>60)
    return {error:'Agrega entre 1 y 60 partidas.'};
  let subtotal=0;const items:Item[]=[];
  for(const raw of body.items){
    if(!isObject(raw)||Object.keys(raw).some(k=>!['description','quantity','unit_price_usd_cents'].includes(k)))
      return {error:'Partida con campos no admitidos.'};
    const description=textField(raw.description,180,false);
    const quantity=raw.quantity;
    const unitPrice=raw.unit_price_usd_cents;
    if(!description||description.length<3||typeof quantity!=='number'||
       !Number.isFinite(quantity)||quantity<0.001||quantity>100000||
       Math.abs(quantity*1000-Math.round(quantity*1000))>0.0000001||
       !cents(unitPrice))
      return {error:'Revisa descripción, cantidad y precio de cada partida.'};
    const lineTotal=Math.round(Math.round(quantity*1000)*unitPrice/1000);
    if(!Number.isSafeInteger(lineTotal))return {error:'Total de partida demasiado alto.'};
    subtotal+=lineTotal;
    items.push({description,quantity,unit_price_usd_cents:unitPrice,
      line_total_usd_cents:lineTotal});
  }
  const taxes=body.taxes_usd_cents??0;
  const freight=body.freight_usd_cents??0;
  const discount=body.discount_usd_cents??0;
  if(!cents(taxes)||!cents(freight)||!cents(discount))
    return {error:'Impuestos, transporte y descuento deben ser importes USD válidos.'};
  const total=subtotal+taxes+freight-discount;
  if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(total)||total<0)
    return {error:'Total inválido. El descuento no puede superar la suma.'};
  const validUntil=textField(body.valid_until,10);
  if(validUntil===undefined||(validUntil!==null&&!validCubanWorkDate(validUntil)))
    return {error:'La fecha de vigencia debe usar AAAA-MM-DD.'};
  const fields=['delivery_terms','warranty_terms','payment_terms','stock_notes',
    'tax_notes','freight_notes','internal_notes'] as const;
  const rest:Record<typeof fields[number],string|null>={
    delivery_terms:null,warranty_terms:null,payment_terms:null,stock_notes:null,
    tax_notes:null,freight_notes:null,internal_notes:null
  };
  for(const field of fields){
    const v=textField(body[field],field==='internal_notes'?1000:600);
    if(v===undefined)return {error:'El campo '+field+' excede el límite permitido.'};
    rest[field]=v;
  }
  return {data:{title,items,subtotal_cents:subtotal,taxes_cents:taxes,
    freight_cents:freight,discount_cents:discount,total_cents:total,
    valid_until:validUntil,...rest}};
}
const audit=(db:Env['DB'],actor:string,action:string,requestId:string,quoteId:string,extra:object,now:string,
  guard?:{status:string;updated_at:string})=>
  db.prepare("INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) "+
    "SELECT ?,?,?,'request',?,?,? FROM commercial_quote_versions WHERE id=? "+
    "AND (? IS NULL OR (status=? AND updated_at=?))")
    .bind(crypto.randomUUID(),actor,action,requestId,
      JSON.stringify({quote_version_id:quoteId,...extra}),now,quoteId,
      guard?.status??null,guard?.status??null,guard?.updated_at??null);

quoteRoutes.get('/requests/:requestId',async c=>{
  const id=c.req.param('requestId');
  if(!validId(id))return c.json({error:'Solicitud inválida.'},400);
  const exists=await c.env.DB.prepare('SELECT id FROM requests WHERE id=?').bind(id).first();
  if(!exists)return c.json({error:'Solicitud no encontrada.'},404);
  const rows=await c.env.DB.prepare(
    'SELECT v.id,v.request_id,v.version_no,v.title,v.currency,v.items_json,'+
    'v.subtotal_cents,v.taxes_cents,v.freight_cents,v.discount_cents,v.total_cents,'+
    'v.valid_until,v.delivery_terms,v.warranty_terms,v.payment_terms,v.stock_notes,'+
    'v.tax_notes,v.freight_notes,v.internal_notes,v.status,v.created_at,v.updated_at,'+
    'v.reviewed_at,v.review_reason,author.email AS created_by_email,'+
    'reviewer.email AS reviewed_by_email FROM commercial_quote_versions v '+
    'JOIN admin_users author ON author.id=v.created_by '+
    'LEFT JOIN admin_users reviewer ON reviewer.id=v.reviewed_by '+
    'WHERE v.request_id=? ORDER BY v.version_no DESC LIMIT 101'
  ).bind(id).all();
  const raw=rows.results||[];
  return c.json({versions:raw.slice(0,100).map((x:any)=>({
    ...x,items:JSON.parse(x.items_json),items_json:undefined
  })),truncated:raw.length>100,request_id:id});
});

quoteRoutes.post('/requests/:requestId/versions',async c=>{
  const requestId=c.req.param('requestId');
  if(!validId(requestId))return c.json({error:'Solicitud inválida.'},400);
  const body=await c.req.json().catch(()=>null);
  const parsed=validate(body);
  if(parsed.error)return c.json({error:parsed.error},400);
  const expected=isObject(body)?body.expected_latest_id:undefined;
  if(expected!==null&&(typeof expected!=='string'||!validId(expected)))
    return c.json({error:'Debes consultar la última versión antes de guardar (expected_latest_id).'},400);
  const request=await c.env.DB.prepare("SELECT id,status FROM requests WHERE id=?")
    .bind(requestId).first<{id:string;status:string}>();
  if(!request)return c.json({error:'Solicitud no encontrada.'},404);
  if(['cancelled','completed'].includes(request.status))
    return c.json({error:'No se prepara cotización para una solicitud cerrada.'},409);
  const previous=await c.env.DB.prepare(
    'SELECT id,version_no,status FROM commercial_quote_versions WHERE request_id=? ORDER BY version_no DESC LIMIT 1'
  ).bind(requestId).first<{id:string;version_no:number;status:string}>();
  if((previous?.id||null)!==expected)
    return c.json({error:'Existe otra versión. Actualiza el expediente antes de crear una revisión.'},409);
  if(previous?.status==='in_review')
    return c.json({error:'Ya existe una cotización pendiente de revisión.'},409);
  const v=parsed.data!,id=crypto.randomUUID(),actor=c.var.user!.user_id as string;
  const now=new Date().toISOString(),num=(previous?.version_no||0)+1;
  const values=[id,requestId,num,v.title,JSON.stringify(v.items),v.subtotal_cents,
    v.taxes_cents,v.freight_cents,v.discount_cents,v.total_cents,v.valid_until,
    v.delivery_terms,v.warranty_terms,v.payment_terms,v.stock_notes,v.tax_notes,
    v.freight_notes,v.internal_notes,actor,now,now];
  // D1.batch es transaccional. El INSERT vuelve a comprobar que
  // la versión vista sigue siendo la última, previniendo concurrencia.
  const insert=
    'INSERT INTO commercial_quote_versions '+
    '(id,request_id,version_no,title,currency,items_json,subtotal_cents,taxes_cents,'+
    'freight_cents,discount_cents,total_cents,valid_until,delivery_terms,warranty_terms,'+
    'payment_terms,stock_notes,tax_notes,freight_notes,internal_notes,status,created_by,created_at,updated_at) '+
    "SELECT ?,?,?,?,'USD',?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,? "+
    'WHERE EXISTS (SELECT 1 FROM requests WHERE id=? AND status NOT IN (\'cancelled\',\'completed\')) '+
    'AND (SELECT COALESCE(MAX(version_no),0) FROM commercial_quote_versions WHERE request_id=?)=? '+
    'AND NOT EXISTS (SELECT 1 FROM commercial_quote_versions WHERE request_id=? AND status=\'in_review\')';
  const writes=[];
  if(previous?.status==='draft'){
    writes.push(c.env.DB.prepare(
      "UPDATE commercial_quote_versions SET status='superseded',updated_at=? WHERE id=? AND status='draft'"
    ).bind(now,previous.id));
  }
  writes.push(c.env.DB.prepare(insert).bind(...values,requestId,requestId,num-1,requestId));
  writes.push(audit(c.env.DB,actor,'quote_version_drafted',requestId,id,{version_no:num},now));
  try{
    const result=await c.env.DB.batch(writes);
    const created=result[previous?.status==='draft'?1:0];
    if(!created?.meta?.changes)return c.json({error:'Los datos cambiaron. Actualiza el expediente.'},409);
  }catch(e){
    if(conflict(e))return c.json({error:'Otra versión fue guardada simultáneamente. Actualiza el expediente.'},409);
    throw e;
  }
  return c.json({id,request_id:requestId,version_no:num,status:'draft',
    message:'Borrador interno creado. No es una oferta oficial.'},201);
});

quoteRoutes.patch('/:id/submit',async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Identificador inválido.'},400);
  const q=await c.env.DB.prepare(
    'SELECT request_id,status,valid_until,delivery_terms,warranty_terms,'+
    'payment_terms,stock_notes,tax_notes,freight_notes,total_cents '+
    'FROM commercial_quote_versions WHERE id=?'
  ).bind(id).first<{
    request_id:string;status:string;valid_until:string|null;
    delivery_terms:string|null;warranty_terms:string|null;payment_terms:string|null;
    stock_notes:string|null;tax_notes:string|null;freight_notes:string|null;
    total_cents:number
  }>();
  if(!q)return c.json({error:'Cotización inexistente.'},404);
  if(q.status!=='draft')return c.json({error:'Esta versión ya no es un borrador activo.'},409);
  if(!q.valid_until||q.valid_until<cubaToday()||
    !q.delivery_terms||!q.warranty_terms||!q.payment_terms||
    !q.stock_notes||!q.tax_notes||!q.freight_notes||q.total_cents<=0)
    return c.json({error:'Completa vigencia futura, entrega, garantía, pago, disponibilidad, impuestos, transporte y total positivo antes de solicitar revisión.'},400);
  const now=new Date().toISOString(),actor=c.var.user!.user_id as string;
  const results=await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE commercial_quote_versions SET status='in_review',updated_at=? WHERE id=? AND status='draft'"
    ).bind(now,id),
    audit(c.env.DB,actor,'quote_submitted_for_review',q.request_id,id,{},now,
      {status:'in_review',updated_at:now})
  ]);
  if(!results[0]?.meta?.changes)return c.json({error:'El borrador cambió. Recarga el expediente.'},409);
  return c.json({status:'in_review',message:'Cotización enviada a revisión interna; no se ha emitido al cliente.'});
});

quoteRoutes.patch('/:id/review',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!validId(id))return c.json({error:'Identificador inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  if(!isObject(body)||Object.keys(body).some(k=>!['decision','reason'].includes(k))||
     !['approve','reject'].includes(String(body.decision)))
    return c.json({error:'Indica si apruebas o rechazas la revisión interna.'},400);
  const reason=body.reason===undefined?'':body.reason;
  if(typeof reason!=='string'||reason.length>500||
     (body.decision==='reject'&&reason.trim().length<3))
    return c.json({error:'La revisión requiere un motivo válido (obligatorio al rechazar).'},400);
  const q=await c.env.DB.prepare(
    "SELECT request_id,status,valid_until,total_cents FROM commercial_quote_versions WHERE id=?"
  ).bind(id).first<{request_id:string;status:string;valid_until:string|null;total_cents:number}>();
  if(!q)return c.json({error:'Versión inexistente.'},404);
  if(q.status!=='in_review')return c.json({error:'La versión ya no está pendiente de revisión.'},409);
  if(body.decision==='approve'&&(!q.valid_until||q.valid_until<cubaToday()||q.total_cents<=0))
    return c.json({error:'La cotización venció o no tiene importe válido; crea otra versión.'},409);
  const status=body.decision==='approve'?'approved_internal':'rejected';
  const actor=c.var.user!.user_id as string,now=new Date().toISOString();
  try{
    const results=await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE commercial_quote_versions SET status=?,reviewed_by=?,reviewed_at=?,review_reason=?,updated_at=? "+
        "WHERE id=? AND status='in_review'"
      ).bind(status,actor,now,reason.trim()||null,now,id),
      audit(c.env.DB,actor,'quote_'+status,q.request_id,id,{decision:body.decision},now,
        {status,updated_at:now})
    ]);
    if(!results[0]?.meta?.changes)return c.json({error:'La revisión ya fue resuelta.'},409);
  }catch(e){
    if(conflict(e))return c.json({error:'Otro responsable resolvió la revisión; actualiza la lista.'},409);
    throw e;
  }
  return c.json({status,message:status==='approved_internal'
    ?'Aprobación INTERNA registrada. No se envió ninguna oferta al cliente.'
    :'Rechazo interno registrado; crea otra versión corregida.'});
});
