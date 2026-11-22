// Warehouse administration is intentionally closed until the release is approved.
// This first API supports stock readings and movements only for verified links.
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth } from '../middleware';
export const warehouseRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
warehouseRoutes.use('*',async(c,next)=>{
  c.header('Cache-Control','private, no-store');
  if(c.env.WAREHOUSE_ENABLED!=='true')return c.json({error:'Almacén aún no habilitado'},503);
  await next();
});
warehouseRoutes.use('*',requireAdminAuth);
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const isObject=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const unitSet=new Set(['unit','m','m2','kg','set','roll','box']);
const kindSet=new Set(['receive','reserve','release','issue','consume','return']);
async function smallBody(req:Request):Promise<Record<string,unknown>|null>{
  if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
  try{
    const reader=req.body?.getReader();if(!reader)return null;
    let size=0,raw='';const decoder=new TextDecoder();
    for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>8192){await reader.cancel();return null}raw+=decoder.decode(r.value,{stream:true})}
    const b=JSON.parse(raw+decoder.decode());return isObject(b)?b:null;
  }catch{return null}
}
function knownConstraint(e:unknown){return /warehouse_|constraint|UNIQUE/i.test(e instanceof Error?e.message:String(e))}
const actorGuard="EXISTS(SELECT 1 FROM admin_users WHERE id=? AND is_active=1 AND role='admin')";
warehouseRoutes.get('/items',async c=>{
 const after=c.req.query('after')||'',search=(c.req.query('search')||'').trim();
 if((after&&!id(after))||search.length>100)return c.json({error:'Consulta inválida'},400);
 const result=await c.env.DB.prepare("SELECT i.id,i.product_id,i.name,i.unit,b.on_hand_milli,b.reserved_milli,b.issued_milli,b.on_hand_milli-b.reserved_milli AS available_milli FROM warehouse_items i JOIN warehouse_balances b ON b.item_id=i.id WHERE i.id>? AND instr(lower(i.name),lower(?))>0 AND "+actorGuard+" ORDER BY i.id LIMIT 51").bind(after,search,c.var.user!.user_id).all();
 const rows=result.results||[],page=rows.slice(0,50);
 return c.json({items:page,next:rows.length>50?page.at(-1)!.id:null});
});
warehouseRoutes.post('/items',async c=>{
 const b=await smallBody(c.req.raw);
 if(!b||Object.keys(b).sort().join(',')!=='id,name,productId,unit'||!id(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>200||typeof b.unit!=='string'||!unitSet.has(b.unit)||(b.productId!==null&&!id(b.productId)))return c.json({error:'Artículo inválido'},400);
 const actor=c.var.user!.user_id;
 try{
  const result=await c.env.DB.prepare("INSERT INTO warehouse_items(id,product_id,name,unit,created_by) SELECT ?,?,?,?,? WHERE "+actorGuard+" AND (? IS NULL OR EXISTS(SELECT 1 FROM products WHERE id=? AND is_active=1)) ON CONFLICT(id) DO NOTHING").bind(b.id,b.productId,b.name.trim(),b.unit,actor,actor,b.productId,b.productId).run();
  const row=await c.env.DB.prepare('SELECT id,product_id,name,unit FROM warehouse_items WHERE id=? AND '+actorGuard).bind(b.id,actor).first();
  if(!row||row.product_id!==b.productId||row.name!==b.name.trim()||row.unit!==b.unit)return c.json({error:'Artículo no disponible o identificador reutilizado'},409);
  return c.json({item:row,replayed:result.meta.changes!==1},result.meta.changes===1?201:200);
 }catch(e){if(knownConstraint(e))return c.json({error:'El producto ya está vinculado o el artículo no es válido'},409);throw e}
});
warehouseRoutes.get('/projects/:id',async c=>{
 const project=c.req.param('id'),actor=c.var.user!.user_id;
 if(!id(project))return c.json({error:'Proyecto inválido'},400);
 const link=await c.env.DB.prepare('SELECT project_id,request_id FROM warehouse_project_links WHERE project_id=? AND '+actorGuard).bind(project,actor).first();
 if(!link)return c.json({error:'Proyecto no vinculado'},404);
 const after=c.req.query('after')||'';
 if(after&&!id(after))return c.json({error:'Cursor inválido'},400);
 const r=await c.env.DB.prepare('SELECT b.item_id,i.name,i.unit,b.reserved_milli,b.issued_milli,b.consumed_milli FROM warehouse_project_balances b JOIN warehouse_items i ON i.id=b.item_id WHERE b.project_id=? AND b.item_id>? AND '+actorGuard+' ORDER BY b.item_id LIMIT 51').bind(project,after,actor).all();
 const rows=r.results||[],page=rows.slice(0,50);
 return c.json({project:link,items:page,next:rows.length>50?page.at(-1)!.item_id:null});
});
warehouseRoutes.get('/works/:id',async c=>{
 const work=c.req.param('id'),actor=c.var.user!.user_id;
 if(!id(work))return c.json({error:'Trabajo inválido'},400);
 const w=await c.env.DB.prepare('SELECT w.id,w.brigade_id,w.request_id,w.status,l.project_id FROM brigade_work w JOIN warehouse_project_links l ON l.request_id=w.request_id WHERE w.id=? AND '+actorGuard).bind(work,actor).first();
 if(!w)return c.json({error:'Trabajo no vinculado'},404);
 const after=c.req.query('after')||'';
 if(after&&!id(after))return c.json({error:'Cursor inválido'},400);
 const result=await c.env.DB.prepare('SELECT b.item_id,i.name,i.unit,b.outstanding_milli,b.delivered_milli,b.consumed_milli,b.returned_milli FROM warehouse_work_balances b JOIN warehouse_items i ON i.id=b.item_id WHERE b.work_id=? AND b.item_id>? AND '+actorGuard+' ORDER BY b.item_id LIMIT 51').bind(work,after,actor).all();
 const rows=result.results||[],page=rows.slice(0,50);
 return c.json({work:w,items:page,next:rows.length>50?page.at(-1)!.item_id:null});
});
warehouseRoutes.post('/movements',async c=>{
 const b=await smallBody(c.req.raw),actor=c.var.user!.user_id;
 if(!b||Object.keys(b).sort().join(',')!=='id,itemId,kind,projectId,quantityMilli,reference,workId'||!id(b.id)||!id(b.itemId)||typeof b.kind!=='string'||!kindSet.has(b.kind)||typeof b.quantityMilli!=='number'||!Number.isSafeInteger(b.quantityMilli)||b.quantityMilli<1||b.quantityMilli>1000000000||typeof b.reference!=='string'||!b.reference.trim()||b.reference.trim().length>200||(b.projectId!==null&&!id(b.projectId))||(b.workId!==null&&!id(b.workId)))return c.json({error:'Movimiento inválido'},400);
 if((b.kind==='receive')!==(b.projectId===null)||(['issue','consume','return'].includes(b.kind))!==(b.workId!==null))return c.json({error:'Proyecto u orden de trabajo inválida'},400);
 const db=c.env.DB;
 const lookup=()=>db.prepare('SELECT id,item_id,project_id,kind,quantity_milli,actor,reference,work_id,created_at FROM warehouse_movements WHERE id=? AND '+actorGuard).bind(b.id,actor).first();
 // Receipt comparison includes actor and every immutable business field.
 const same=(r:Record<string,unknown>|null)=>!!r&&r.item_id===b.itemId&&r.project_id===b.projectId&&r.kind===b.kind&&r.quantity_milli===b.quantityMilli&&r.actor===actor&&r.reference===String(b.reference).trim()&&r.work_id===b.workId;
 const previous=await lookup();
 if(previous)return same(previous)?c.json({movement:previous,replayed:true}):c.json({error:'Identificador de movimiento reutilizado'},409);
 try{
  // All stock invariants and work linkage validated atomically by D1 triggers.
  await db.prepare('INSERT INTO warehouse_movements(id,item_id,project_id,kind,quantity_milli,actor,reference,work_id) SELECT ?,?,?,?,?,?,?,? WHERE '+actorGuard+' AND NOT EXISTS(SELECT 1 FROM warehouse_movements WHERE id=?)').bind(b.id,b.itemId,b.projectId,b.kind,b.quantityMilli,actor,b.reference.trim(),b.workId,actor,b.id).run();
 }catch(e){if(!knownConstraint(e))throw e;const raced=await lookup();if(same(raced))return c.json({movement:raced,replayed:true});return c.json({error:'Saldo insuficiente, orden no autorizada o movimiento incompatible'},409)}
 const row=await lookup();
 return same(row)?c.json({movement:row},201):c.json({error:'Movimiento no confirmado'},409);
});

// Procurement shares the warehouse gate and live administrator middleware.
const currencies=new Set(['USD','CUP','EUR','CNY']);
const incoterms=new Set(['EXW','FCA','FOB','CFR','CIF','DAP','DDP','LOCAL']);
const short=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
warehouseRoutes.get('/procurement/suppliers',async c=>{
 const after=c.req.query('after')||'',actor=c.var.user!.user_id;
 if(after&&!id(after))return c.json({error:'Cursor inválido'},400);
 const r=await c.env.DB.prepare('SELECT id,name,country,contact,active FROM procurement_suppliers WHERE id>? AND '+actorGuard+' ORDER BY id LIMIT 51').bind(after,actor).all();
 const rows=r.results||[],page=rows.slice(0,50);
 return c.json({suppliers:page,next:rows.length>50?page.at(-1)!.id:null});
});
warehouseRoutes.post('/procurement/suppliers',async c=>{
 const b=await smallBody(c.req.raw),actor=c.var.user!.user_id;
 if(!b||Object.keys(b).sort().join(',')!=='contact,country,id,name'||!id(b.id)||!short(b.name,200)||!short(b.country,100)||(b.contact!==null&&!short(b.contact,300)))return c.json({error:'Proveedor inválido'},400);
 const db=c.env.DB,contact=b.contact===null?null:b.contact.trim();
 try{
  const result=await db.prepare('INSERT INTO procurement_suppliers(id,name,country,contact,created_by) SELECT ?,?,?,?,? WHERE '+actorGuard+' ON CONFLICT(id) DO NOTHING').bind(b.id,b.name.trim(),b.country.trim(),contact,actor,actor).run();
  const row=await db.prepare('SELECT id,name,country,contact,active FROM procurement_suppliers WHERE id=? AND '+actorGuard).bind(b.id,actor).first();
  if(!row||row.name!==b.name.trim()||row.country!==b.country.trim()||row.contact!==contact)return c.json({error:'Proveedor no disponible o ID reutilizado'},409);
  return c.json({supplier:row,replayed:result.meta.changes!==1},result.meta.changes===1?201:200);
 }catch(e){if(knownConstraint(e))return c.json({error:'Proveedor no autorizado'},409);throw e}
});
warehouseRoutes.get('/procurement/orders',async c=>{
 const after=c.req.query('after')||'',actor=c.var.user!.user_id;
 if(after&&!id(after))return c.json({error:'Cursor inválido'},400);
 const r=await c.env.DB.prepare('SELECT o.id,o.supplier_id,s.name AS supplier_name,o.project_id,o.currency,o.incoterm,o.reference,o.status,o.created_at,(SELECT COALESCE(SUM(total_minor),0) FROM procurement_lines WHERE order_id=o.id) AS total_minor FROM procurement_orders o JOIN procurement_suppliers s ON s.id=o.supplier_id WHERE o.id>? AND '+actorGuard+' ORDER BY o.id LIMIT 51').bind(after,actor).all();
 const rows=r.results||[],page=rows.slice(0,50);
 return c.json({orders:page,next:rows.length>50?page.at(-1)!.id:null});
});
warehouseRoutes.get('/procurement/orders/:id',async c=>{
 const order=c.req.param('id'),actor=c.var.user!.user_id;
 if(!id(order))return c.json({error:'Pedido inválido'},400);
 const db=c.env.DB;
 const row=await db.prepare('SELECT * FROM procurement_orders WHERE id=? AND '+actorGuard).bind(order,actor).first();
 if(!row)return c.json({error:'Pedido no disponible'},404);
 const lines=await db.prepare('SELECT b.*,i.name,i.unit FROM procurement_line_balances b JOIN warehouse_items i ON i.id=b.item_id WHERE b.order_id=? AND '+actorGuard+' ORDER BY b.id LIMIT 101').bind(order,actor).all();
 return c.json({order:row,lines:lines.results||[]});
});
warehouseRoutes.post('/procurement/orders',async c=>{
 const b=await smallBody(c.req.raw),actor=c.var.user!.user_id;
 if(!b||Object.keys(b).sort().join(',')!=='currency,id,incoterm,lines,projectId,reference,supplierId'||!id(b.id)||!id(b.supplierId)||(b.projectId!==null&&!id(b.projectId))||typeof b.currency!=='string'||!currencies.has(b.currency)||typeof b.incoterm!=='string'||!incoterms.has(b.incoterm)||!short(b.reference,200)||!Array.isArray(b.lines)||b.lines.length<1||b.lines.length>50)return c.json({error:'Pedido inválido'},400);
 const lines:{id:string;itemId:string;quantityMilli:number;totalMinor:number}[]=[];
 for(const l of b.lines){
  if(!isObject(l)||Object.keys(l).sort().join(',')!=='id,itemId,quantityMilli,totalMinor'||!id(l.id)||!id(l.itemId)||!integer(l.quantityMilli,1,1000000000)||!integer(l.totalMinor,0,1000000000000))return c.json({error:'Línea inválida'},400);
  lines.push({id:l.id,itemId:l.itemId,quantityMilli:l.quantityMilli,totalMinor:l.totalMinor});
 }
 if(new Set(lines.map(l=>l.id)).size!==lines.length||new Set(lines.map(l=>l.itemId)).size!==lines.length)return c.json({error:'Líneas duplicadas'},400);
 const db=c.env.DB,order=b.id,reference=b.reference.trim();
 const lookup=()=>db.prepare('SELECT id,supplier_id,project_id,currency,incoterm,reference,status,created_by FROM procurement_orders WHERE id=? AND '+actorGuard).bind(order,actor).first();
 const matches=async(row:Record<string,unknown>|null)=>{
  if(!row||row.supplier_id!==b.supplierId||row.project_id!==b.projectId||row.currency!==b.currency||row.incoterm!==b.incoterm||row.reference!==reference||row.created_by!==actor)return false;
  const existing=await db.prepare('SELECT id,item_id,quantity_milli,total_minor FROM procurement_lines WHERE order_id=? AND '+actorGuard+' ORDER BY id').bind(order,actor).all();
  return existing.results?.length===lines.length&&lines.every(l=>existing.results.some(x=>x.id===l.id&&x.item_id===l.itemId&&x.quantity_milli===l.quantityMilli&&x.total_minor===l.totalMinor));
 };
 const prior=await lookup();
 if(prior)return await matches(prior)?c.json({order:prior,replayed:true}):c.json({error:'Identificador de pedido reutilizado'},409);
 try{
  const statements=[db.prepare('INSERT INTO procurement_orders(id,supplier_id,project_id,currency,incoterm,reference,created_by) SELECT ?,?,?,?,?,?,? WHERE '+actorGuard).bind(order,b.supplierId,b.projectId,b.currency,b.incoterm,reference,actor,actor),
  ...lines.map(l=>db.prepare('INSERT INTO procurement_lines(id,order_id,item_id,quantity_milli,total_minor) SELECT ?,?,?,?,? WHERE '+actorGuard).bind(l.id,order,l.itemId,l.quantityMilli,l.totalMinor,actor))];
  const result=await db.batch(statements);
  if(result.some(x=>x.meta.changes!==1))return c.json({error:'Pedido no confirmado'},409);
 }catch(e){if(!knownConstraint(e))throw e;const existing=await lookup();return await matches(existing)?c.json({order:existing,replayed:true}):c.json({error:'Pedido incompatible o no autorizado'},409)}
 return c.json({order:await lookup()},201);
});
warehouseRoutes.post('/procurement/orders/:id/decision',async c=>{
 const order=c.req.param('id'),actor=c.var.user!.user_id,b=await smallBody(c.req.raw);
 if(!id(order)||!b||Object.keys(b).join(',')!=='decision'||!['approve','close','cancel'].includes(String(b.decision)))return c.json({error:'Decisión inválida'},400);
 const db=c.env.DB,now=new Date().toISOString();
 const sql=b.decision==='approve'?"UPDATE procurement_orders SET status='ordered',approved_by=?,approved_at=? WHERE id=? AND status='draft' AND "+actorGuard:
 b.decision==='close'?"UPDATE procurement_orders SET status='closed' WHERE id=? AND status='ordered' AND "+actorGuard:
 "UPDATE procurement_orders SET status='cancelled' WHERE id=? AND status IN ('draft','ordered') AND "+actorGuard;
 try{
  const statement=db.prepare(sql).bind(...(b.decision==='approve'?[actor,now,order,actor]:[order,actor]));
  const audit=db.prepare("INSERT INTO audit_logs(id,admin_user_id,action,entity_type,entity_id,details,created_at) SELECT ?,? ,?,'procurement_order',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),actor,'procurement_'+String(b.decision),order,JSON.stringify({decision:b.decision}),now);
  const results=await db.batch([statement,audit]);
  return results[0].meta.changes===1?c.json({ok:true}):c.json({error:'Decisión no confirmada'},409);
 }catch(e){if(knownConstraint(e))return c.json({error:'Estado, recepciones o aprobación incompatibles'},409);throw e}
});
warehouseRoutes.post('/procurement/receipts',async c=>{
 const b=await smallBody(c.req.raw),actor=c.var.user!.user_id;
 if(!b||Object.keys(b).sort().join(',')!=='id,lineId,quantityMilli,reference'||!id(b.id)||!id(b.lineId)||!integer(b.quantityMilli,1,1000000000)||!short(b.reference,200))return c.json({error:'Recepción inválida'},400);
 const db=c.env.DB,reference=b.reference.trim();
 const lookup=()=>db.prepare('SELECT id,item_id,kind,quantity_milli,actor,reference,purchase_line_id,project_id,work_id FROM warehouse_movements WHERE id=? AND '+actorGuard).bind(b.id,actor).first();
 const same=(row:Record<string,unknown>|null)=>!!row&&row.kind==='receive'&&row.quantity_milli===b.quantityMilli&&row.actor===actor&&row.reference===reference&&row.purchase_line_id===b.lineId&&row.project_id===null&&row.work_id===null;
 const prior=await lookup();
 if(prior)return same(prior)?c.json({movement:prior,replayed:true}):c.json({error:'Identificador reutilizado'},409);
 try{
  // Single movement is both the receipt and stock increase. Trigger validates
  // same item, open order and remaining quantity at the moment of insertion.
  await db.prepare("INSERT INTO warehouse_movements(id,item_id,kind,quantity_milli,actor,reference,purchase_line_id) SELECT ?,l.item_id,'receive',?,?,?,l.id FROM procurement_lines l WHERE l.id=? AND "+actorGuard+" AND NOT EXISTS(SELECT 1 FROM warehouse_movements WHERE id=?)").bind(b.id,b.quantityMilli,actor,reference,b.lineId,actor,b.id).run();
 }catch(e){if(!knownConstraint(e))throw e;const existing=await lookup();if(same(existing))return c.json({movement:existing,replayed:true});return c.json({error:'Recepción superior al saldo o pedido no autorizado'},409)}
 const row=await lookup();
 return same(row)?c.json({movement:row},201):c.json({error:'Recepción no confirmada'},409);
});
warehouseRoutes.get('/procurement/shortages/:project',async c=>{
 const project=c.req.param('project'),after=c.req.query('after')||'',actor=c.var.user!.user_id;
 if(!id(project)||(after&&!id(after)))return c.json({error:'Consulta inválida'},400);
 const db=c.env.DB;
 if(!await db.prepare('SELECT project_id FROM warehouse_project_links WHERE project_id=? AND '+actorGuard).bind(project,actor).first())return c.json({error:'Proyecto no vinculado'},404);
 const r=await db.prepare('SELECT s.*,i.name,i.unit FROM procurement_project_shortages s JOIN warehouse_items i ON i.id=s.item_id WHERE s.project_id=? AND s.item_id>? AND '+actorGuard+' ORDER BY s.item_id LIMIT 51').bind(project,after,actor).all();
 const rows=r.results||[],page=rows.slice(0,50);
 return c.json({requirements:page,next:rows.length>50?page.at(-1)!.item_id:null,sharedAvailabilityIsReservation:false});
});

// Verified cross-service link. No client-supplied project name or membership
// accepted as proof. Missing binding leaves this endpoint closed.
warehouseRoutes.post('/projects/:id/link',async c=>{
 const project=c.req.param('id'),actor=c.var.user!.user_id,db=c.env.DB;
 const b=await smallBody(c.req.raw);
 if(!id(project)||!b||Object.keys(b).join(',')!=='requestId'||!id(b.requestId))return c.json({error:'Vinculación inválida'},400);
 if(!c.env.STUDIO_API)return c.json({error:'Verificación de Studio no configurada'},503);
 let proof:unknown;
 try{
  const auth=c.req.header('authorization')||'';
  const response=await c.env.STUDIO_API.fetch(new Request('https://studio.internal/v1/projects/'+project+'/warehouse-link-proof',{headers:{Authorization:auth,Accept:'application/json'},redirect:'manual'}));
  if([401,403,404].includes(response.status))return c.json({error:'Proyecto no autorizado'},403);
  if(!response.ok)return c.json({error:'Studio no pudo verificar el proyecto'},503);
  proof=await response.json();
 }catch{return c.json({error:'Studio no pudo verificar el proyecto'},503)}
 if(!isObject(proof)||proof.actor!==actor||proof.purpose!=='warehouse-link-v1'||!isObject(proof.project)||proof.project.id!==project)return c.json({error:'Verificación incompatible'},503);
 const lookup=()=>db.prepare('SELECT project_id,request_id,linked_by FROM warehouse_project_links WHERE project_id=? AND '+actorGuard).bind(project,actor).first();
 const previous=await lookup();
 if(previous)return previous.request_id===b.requestId?c.json({link:previous,replayed:true}):c.json({error:'Proyecto ya vinculado a otra solicitud'},409);
 try{
  const result=await db.prepare("INSERT INTO warehouse_project_links(project_id,request_id,linked_by) SELECT ?,r.id,? FROM requests r WHERE r.id=? AND r.status<>'cancelled' AND "+actorGuard+" ON CONFLICT(project_id) DO NOTHING").bind(project,actor,b.requestId,actor).run();
  const row=await lookup();
  return row?.request_id===b.requestId?c.json({link:row,replayed:result.meta.changes!==1},result.meta.changes===1?201:200):c.json({error:'Solicitud no disponible o vínculo incompatible'},409);
 }catch(e){if(knownConstraint(e))return c.json({error:'La solicitud ya pertenece a otro proyecto'},409);throw e}
});
// Explicit material requirement approval. Unlike stock reservation, this is
// a demand baseline, immutable until revision workflow is implemented.
warehouseRoutes.post('/projects/:id/requirements',async c=>{
 const project=c.req.param('id'),actor=c.var.user!.user_id,db=c.env.DB,b=await smallBody(c.req.raw);
 if(!id(project)||!b||Object.keys(b).sort().join(',')!=='itemId,quantityMilli'||!id(b.itemId)||!integer(b.quantityMilli,1,1000000000))return c.json({error:'Necesidad inválida'},400);
 const lookup=()=>db.prepare('SELECT project_id,item_id,quantity_milli,approved_by FROM warehouse_project_requirements WHERE project_id=? AND item_id=? AND '+actorGuard).bind(project,b.itemId,actor).first();
 const previous=await lookup();
 if(previous)return previous.quantity_milli===b.quantityMilli?c.json({requirement:previous,replayed:true}):c.json({error:'Necesidad ya aprobada; requiere revisión formal'},409);
 try{
  const result=await db.prepare("INSERT INTO warehouse_project_requirements(project_id,item_id,quantity_milli,approved_by) SELECT ?,?,?,? WHERE "+actorGuard+" ON CONFLICT(project_id,item_id) DO NOTHING").bind(project,b.itemId,b.quantityMilli,actor,actor).run();
  const row=await lookup();
  return row?.quantity_milli===b.quantityMilli?c.json({requirement:row,replayed:result.meta.changes!==1},result.meta.changes===1?201:200):c.json({error:'Necesidad no confirmada'},409);
 }catch(e){if(knownConstraint(e))return c.json({error:'Proyecto, artículo o cantidad incompatible'},409);throw e}
});
