import {Hono} from 'hono';
import type {Env} from '../types';
import {requireAdminAuth} from '../middleware';
import {cubaToday,validCubanWorkDate} from '../brigade-policy';
import {documentFormat,maxDocumentBytes} from '../request-documents';
export const deliveryRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
deliveryRoutes.use('*',requireAdminAuth);
deliveryRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(!await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_deliveries'").first())return c.json({error:'Entrega y garantía pendientes de migración 034.'},503);
 await next();
});
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const str=(x:unknown,min:number,max:number):x is string=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const read=async(env:Env,q:string)=>env.DB.prepare('SELECT quote_id,reference,delivered_on,customer_name,summary,warranty_terms,warranty_end,evidence_note,filename,sha256,size_bytes,recorded_at FROM service_deliveries WHERE quote_id=?').bind(q).first<{reference:string;delivered_on:string;customer_name:string;summary:string;warranty_terms:string;warranty_end:string|null;evidence_note:string;sha256:string}>();
async function bounded(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
 const reader=req.body?.getReader();if(!reader)return null;
 const limit=Math.ceil(maxDocumentBytes/3)*4+32768;
 try{let total=0,raw='';const dec=new TextDecoder();for(;;){const p=await reader.read();if(p.done)break;total+=p.value.byteLength;if(total>limit){await reader.cancel();return null}raw+=dec.decode(p.value,{stream:true})}const b=JSON.parse(raw+dec.decode());return b&&typeof b==='object'&&!Array.isArray(b)?b:null}catch{return null}finally{reader.releaseLock()}
}
deliveryRoutes.get('/:id',async c=>{
 const q=c.req.param('id');if(!id(q))return c.json({error:'Orden inválida'},400);
 const context=await c.env.DB.prepare("SELECT o.reference AS work_reference,o.scope,o.project_id,r.id AS request_id,r.status AS request_status,d.reference AS contract_reference,json_extract(d.body_json,'$.warranty') AS warranty_terms,json_extract(d.body_json,'$.customer') AS customer_name FROM service_work_orders o JOIN warehouse_project_links l ON l.project_id=o.project_id JOIN requests r ON r.id=l.request_id JOIN service_contract_approvals a ON a.quote_id=o.quote_id JOIN service_contract_drafts d ON d.quote_id=a.quote_id AND d.revision=a.revision WHERE o.quote_id=?").bind(q).first();
 if(!context)return c.json({error:'Orden no disponible'},404);
 const checks=await c.env.DB.prepare("SELECT (SELECT COUNT(*) FROM service_work_assignments a JOIN brigade_work w ON w.id=a.work_id WHERE a.quote_id=? AND w.status='completed' AND EXISTS(SELECT 1 FROM technical_work_reports t WHERE t.work_id=w.id AND t.report_type='completion_proposed' AND t.review_status='accepted')) AS completed,(SELECT COUNT(*) FROM brigade_work WHERE request_id=? AND status IN ('scheduled','pending_approval')) AS pending,(SELECT COUNT(*) FROM warehouse_project_balances WHERE project_id=? AND (reserved_milli<>0 OR issued_milli<>0)) AS outstanding").bind(q,context.request_id,context.project_id).first<{completed:number;pending:number;outstanding:number}>();
 return c.json({context,checks,delivery:await read(c.env,q)});
});
deliveryRoutes.post('/:id',async c=>{
 const q=c.req.param('id');if(!id(q))return c.json({error:'Orden inválida'},400);
 const b=await bounded(c.req.raw);
 if(!b||Object.keys(b).sort().join(',')!=='customer_name,delivered_on,evidence,filename,pdf,reference,reviewed,summary,warranty_end,warranty_terms'||b.reviewed!==true||!validCubanWorkDate(b.delivered_on)||b.delivered_on>cubaToday()||!(b.warranty_end===null||validCubanWorkDate(b.warranty_end)&&b.warranty_end>=b.delivered_on)||!str(b.reference,3,100)||!str(b.customer_name,3,300)||!str(b.summary,10,2000)||!str(b.warranty_terms,10,2000)||!str(b.evidence,15,900)||!str(b.filename,5,120)||typeof b.pdf!=='string'||b.pdf.length>Math.ceil(maxDocumentBytes/3)*4)return c.json({error:'Completa entrega, garantía y copia firmada revisada.'},400);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(b.pdf),s=>s.charCodeAt(0))}catch{return c.json({error:'PDF inválido'},400)}
 const format=documentFormat(b.filename,bytes);if(format?.contentType!=='application/pdf')return c.json({error:'Solo PDF de hasta 8 MB.'},400);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const old=await read(c.env,q);if(old)return old.sha256===hash&&old.reference===b.reference.trim()&&old.delivered_on===b.delivered_on&&old.customer_name===b.customer_name.trim()&&old.summary===b.summary.trim()&&old.warranty_terms===b.warranty_terms.trim()&&old.warranty_end===b.warranty_end&&old.evidence_note===b.evidence.trim()?c.json({delivery:old}):c.json({error:'Entrega ya registrada. No se sobrescribe.'},409);
 const key='private-documents/delivery-'+crypto.randomUUID();
 await c.env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await c.env.DB.prepare('INSERT INTO service_deliveries(quote_id,reference,delivered_on,customer_name,summary,warranty_terms,warranty_end,evidence_note,r2_key,filename,sha256,size_bytes,recorded_by,recorded_at,recorded_cuba_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(q,b.reference.trim(),b.delivered_on,b.customer_name.trim(),b.summary.trim(),b.warranty_terms.trim(),b.warranty_end,b.evidence.trim(),key,format.filename,hash,bytes.length,c.var.user!.user_id,new Date().toISOString(),cubaToday()).run()}catch(e){await c.env.BUCKET.delete(key).catch(()=>{});if(/constraint|service_delivery/i.test(String(e)))return c.json({error:'No se puede entregar: revisa trabajos, evidencias técnicas, reservas y materiales entregados.'},409);throw e}
 return c.json({delivery:await read(c.env,q)},201);
});
deliveryRoutes.get('/:id/signed',async c=>{
 const q=c.req.param('id');if(!id(q))return c.json({error:'Orden inválida'},400);
 const row=await c.env.DB.prepare('SELECT r2_key,filename,size_bytes,sha256 FROM service_deliveries WHERE quote_id=?').bind(q).first<{r2_key:string;filename:string;size_bytes:number;sha256:string}>();
 if(!row)return c.notFound();const f=await c.env.BUCKET.get(row.r2_key);if(!f||f.size!==row.size_bytes||f.size>maxDocumentBytes)return c.json({error:'Copia no disponible'},409);
 const bytes=new Uint8Array(await f.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==row.sha256)return c.json({error:'Integridad no confirmada'},409);
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return c.json({filename:row.filename,pdf:btoa(raw),sha256:hash});
});
