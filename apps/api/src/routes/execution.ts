import {Hono} from 'hono';
import type {Env} from '../types';
import {requireAdminAuth} from '../middleware';
export const executionRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
executionRoutes.use('*',requireAdminAuth);
executionRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(!await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_work_orders'").first())return c.json({error:'Órdenes de trabajo pendientes de migración 033.'},503);
 await next();
});
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const str=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
async function state(env:Env,quoteId:string){
 const context=await env.DB.prepare("SELECT q.request_id,q.title,q.version_no,r.status AS request_status,l.project_id,d.reference AS contract_reference,s.signed_on FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id JOIN service_contract_signatures s ON s.quote_id=q.id JOIN service_contract_approvals a ON a.quote_id=q.id JOIN service_contract_drafts d ON d.quote_id=a.quote_id AND d.revision=a.revision LEFT JOIN warehouse_project_links l ON l.request_id=r.id WHERE q.id=?").bind(quoteId).first<{request_id:string;project_id:string|null;request_status:string}>();
 if(!context)return null;
 const order=await env.DB.prepare('SELECT * FROM service_work_orders WHERE quote_id=?').bind(quoteId).first();
 const shortages=context.project_id?(await env.DB.prepare('SELECT s.*,i.name,i.unit FROM procurement_project_shortages s JOIN warehouse_items i ON i.id=s.item_id WHERE s.project_id=? ORDER BY i.name LIMIT 101').bind(context.project_id).all()).results||[]:[];
 const works=(await env.DB.prepare('SELECT w.id,w.work_date,w.status,w.estimated_minutes,b.name AS brigade_name FROM service_work_assignments a JOIN brigade_work w ON w.id=a.work_id JOIN brigades b ON b.id=w.brigade_id WHERE a.quote_id=? ORDER BY w.work_date,w.id LIMIT 101').bind(quoteId).all()).results||[];
 return {context,order,requirements:shortages.slice(0,100),requirements_truncated:shortages.length>100,works:works.slice(0,100),works_truncated:works.length>100};
}
executionRoutes.get('/:id',async c=>{const q=c.req.param('id')||'';if(!id(q))return c.json({error:'Referencia inválida'},400);const data=await state(c.env,q);return data?c.json(data):c.json({error:'Se requiere contrato firmado.'},409)});
executionRoutes.post('/:id',async c=>{
 const q=c.req.param('id')||'';if(!id(q))return c.json({error:'Referencia inválida'},400);
 const raw=await c.req.text();if(new TextEncoder().encode(raw).length>8192)return c.json({error:'Orden demasiado extensa'},413);
 let b:any;try{b=JSON.parse(raw)}catch{return c.json({error:'JSON inválido'},400)}
 if(!b||Object.keys(b).sort().join(',')!=='material_mode,readiness_note,reference,scope'||!str(b.reference,3,100)||!str(b.scope,3,2000)||!str(b.readiness_note,15,1000)||!['warehouse','customer_only'].includes(b.material_mode))return c.json({error:'Completa alcance, referencia y comprobación de materiales y acceso.'},400);
 const data=await state(c.env,q);if(!data?.context.project_id)return c.json({error:'Vincula primero el proyecto con la solicitud.'},409);
 const same=(r:any)=>r&&r.reference===b.reference.trim()&&r.scope===b.scope.trim()&&r.readiness_note===b.readiness_note.trim()&&r.material_mode===b.material_mode;
 if(data.order)return same(data.order)?c.json(data):c.json({error:'La orden ya está autorizada. Requiere revisión administrativa formal.'},409);
 try{await c.env.DB.prepare('INSERT INTO service_work_orders(quote_id,project_id,reference,scope,readiness_note,material_mode,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?)').bind(q,data.context.project_id,b.reference.trim(),b.scope.trim(),b.readiness_note.trim(),b.material_mode,c.var.user!.user_id,new Date().toISOString()).run()}
 catch(e){if(/constraint|service_work_order/i.test(String(e)))return c.json({error:'No se puede autorizar: contrato, materiales reservados o solicitud no disponibles.'},409);throw e}
 return c.json(await state(c.env,q),201);
});
