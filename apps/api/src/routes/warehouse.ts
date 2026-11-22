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
