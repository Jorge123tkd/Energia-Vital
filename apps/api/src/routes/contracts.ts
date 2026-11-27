import {Hono} from 'hono';
import type {Env} from '../types';
import {requireAdminAuth} from '../middleware';
import {cubaToday,validCubanWorkDate} from '../brigade-policy';
import {documentFormat,maxDocumentBytes} from '../request-documents';
export const contractRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
contractRoutes.use('*',requireAdminAuth);
contractRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(!await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='service_contract_drafts'").first())return c.json({error:'Contratos pendientes de habilitación (migración 032).'},503);
 await next();
});
const id=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const str=(x:unknown,min:number,max:number):x is string=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const fields=['supplier','customer','site','scope','payment','schedule','warranty','obligations','changes','delivery'] as const;
async function readBody(req:Request,limit:number){
 if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
 const reader=req.body?.getReader();if(!reader)return null;
 try{let length=0,raw='';const decoder=new TextDecoder();for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit){await reader.cancel();return null}raw+=decoder.decode(part.value,{stream:true})}const b=JSON.parse(raw+decoder.decode());return b&&typeof b==='object'&&!Array.isArray(b)?b:null}catch{return null}finally{reader.releaseLock()}
}
const conflict=(e:unknown)=>/constraint|service_contract_/i.test(String(e));
const baseQuote="SELECT q.id,q.request_id,q.title,q.version_no,q.currency,q.items_json,q.subtotal_cents,q.taxes_cents,q.freight_cents,q.discount_cents,q.total_cents,q.valid_until,q.stock_notes,q.payment_terms,q.delivery_terms,q.warranty_terms,r.location,r.status AS request_status,d.decided_at FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id JOIN commercial_quote_decisions d ON d.quote_id=q.id WHERE q.id=? AND d.decision='accept' AND q.status='approved_internal'";
const read=async(env:Env,id:string)=>{
 const draft=await env.DB.prepare('SELECT quote_id,revision,reference,body_json,created_at FROM service_contract_drafts WHERE quote_id=? ORDER BY revision DESC LIMIT 1').bind(id).first<{quote_id:string;revision:number;reference:string;body_json:string;created_at:string}>();
 const approved=await env.DB.prepare('SELECT revision,review_note,approved_at,approved_cuba_date FROM service_contract_approvals WHERE quote_id=?').bind(id).first<{revision:number;review_note:string;approved_at:string;approved_cuba_date:string}>();
 const signed=await env.DB.prepare('SELECT signed_on,evidence_note,filename,sha256,size_bytes,recorded_at FROM service_contract_signatures WHERE quote_id=?').bind(id).first();
 return {draft:draft?{quote_id:draft.quote_id,revision:draft.revision,reference:draft.reference,created_at:draft.created_at,terms:JSON.parse(draft.body_json)}:null,approved,signed};
};
contractRoutes.get('/:id',async c=>{
 const quoteId=c.req.param('id');if(!id(quoteId))return c.json({error:'Cotización inválida'},400);
 const q=await c.env.DB.prepare(baseQuote).bind(quoteId).first<{items_json:string;[key:string]:unknown}>();
 if(!q)return c.json({error:'Se requiere una propuesta aceptada.'},409);
 const {items_json,...quote}=q;return c.json({quote:{...quote,items:JSON.parse(items_json)},...await read(c.env,quoteId)});
});
contractRoutes.post('/:id',async c=>{
 const quoteId=c.req.param('id');if(!id(quoteId))return c.json({error:'Cotización inválida'},400);
 const b=await readBody(c.req.raw,16000);
 if(!b||Object.keys(b).sort().join(',')!==[...fields,'reference','expected_revision'].sort().join(',')||!Number.isSafeInteger(b.expected_revision)||b.expected_revision<0||b.expected_revision>=1000000||!str(b.reference,3,80)||!fields.every(k=>str(b[k],3,k==='supplier'||k==='customer'?500:1200)))return c.json({error:'Completa identificación de las partes, alcance y condiciones del contrato.'},400);
 const terms=Object.fromEntries(fields.map(k=>[k,b[k].trim()]));
 const body=JSON.stringify(terms),reference=b.reference.trim(),actor=c.var.user!.user_id;
 const prior=await read(c.env,quoteId);if(prior.draft&&prior.draft.reference===reference&&JSON.stringify(prior.draft.terms)===body)return c.json(prior);
 if(prior.approved||(prior.draft?.revision||0)!==b.expected_revision||(prior.draft&&prior.draft.reference!==reference))return c.json({error:'Revisión desactualizada, referencia modificada o contrato ya aprobado.'},409);
 try{await c.env.DB.prepare('INSERT INTO service_contract_drafts(quote_id,revision,reference,body_json,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(quoteId,b.expected_revision+1,reference,body,actor,new Date().toISOString()).run()}catch(e){if(conflict(e))return c.json({error:'No se pudo crear: propuesta no aceptada, referencia repetida o expediente cerrado.'},409);throw e}
 return c.json(await read(c.env,quoteId),201);
});
contractRoutes.post('/:id/approve',async c=>{
 const quoteId=c.req.param('id');if(!id(quoteId))return c.json({error:'Cotización inválida'},400);
 const b=await readBody(c.req.raw,8192);
 if(!b||Object.keys(b).sort().join(',')!=='review_note,reviewed,revision'||b.reviewed!==true||!Number.isSafeInteger(b.revision)||!str(b.review_note,15,900))return c.json({error:'Confirma la revisión jurídica y administrativa del contenido.'},400);
 const old=await read(c.env,quoteId);
 if(old.approved)return old.approved.revision===b.revision&&old.approved.review_note===b.review_note.trim()?c.json(old):c.json({error:'Ya existe una aprobación.'},409);
 if(old.draft?.revision!==b.revision)return c.json({error:'Revisa la última versión del borrador.'},409);
 try{await c.env.DB.prepare('INSERT INTO service_contract_approvals(quote_id,revision,review_note,approved_by,approved_at,approved_cuba_date) VALUES(?,?,?,?,?,?)').bind(quoteId,b.revision,b.review_note.trim(),c.var.user!.user_id,new Date().toISOString(),cubaToday()).run()}catch(e){if(conflict(e))return c.json({error:'No se pudo aprobar la revisión actual.'},409);throw e}
 return c.json(await read(c.env,quoteId),201);
});
contractRoutes.post('/:id/signed',async c=>{
 const quoteId=c.req.param('id');if(!id(quoteId))return c.json({error:'Cotización inválida'},400);
 const b=await readBody(c.req.raw,Math.ceil(maxDocumentBytes/3)*4+4096);
 if(!b||Object.keys(b).sort().join(',')!=='evidence,filename,pdf,reviewed,signed_on'||b.reviewed!==true||!validCubanWorkDate(b.signed_on)||b.signed_on>cubaToday()||!str(b.evidence,15,900)||!str(b.filename,5,120)||typeof b.pdf!=='string'||b.pdf.length>Math.ceil(maxDocumentBytes/3)*4)return c.json({error:'Adjunta el PDF firmado y confirma la comprobación presencial/documental.'},400);
 const old=await read(c.env,quoteId);if(!old.draft||!old.approved)return c.json({error:'Primero genera y aprueba el contrato para firma.'},409);
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(b.pdf),s=>s.charCodeAt(0))}catch{return c.json({error:'PDF inválido'},400)}
 const format=documentFormat(b.filename,bytes);if(format?.contentType!=='application/pdf')return c.json({error:'Solo PDF de hasta 8 MB.'},400);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(old.signed)return old.signed.sha256===hash&&old.signed.signed_on===b.signed_on&&old.signed.evidence_note===b.evidence.trim()?c.json(old):c.json({error:'Ya existe evidencia firmada. No se reemplaza.'},409);
 const key='private-documents/contract-'+crypto.randomUUID(),actor=c.var.user!.user_id;
 await c.env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await c.env.DB.prepare('INSERT INTO service_contract_signatures(quote_id,signed_on,evidence_note,r2_key,filename,sha256,size_bytes,reviewed_by,recorded_at,recorded_cuba_date) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(quoteId,b.signed_on,b.evidence.trim(),key,format.filename,hash,bytes.length,actor,new Date().toISOString(),cubaToday()).run()}catch(e){await c.env.BUCKET.delete(key).catch(()=>{});if(conflict(e))return c.json({error:'Contrato cerrado, fecha incompatible o firma ya registrada.'},409);throw e}
 return c.json(await read(c.env,quoteId),201);
});
contractRoutes.get('/:id/signed',async c=>{
 const quoteId=c.req.param('id');if(!id(quoteId))return c.json({error:'Cotización inválida'},400);
 const row=await c.env.DB.prepare('SELECT r2_key,filename,size_bytes,sha256 FROM service_contract_signatures WHERE quote_id=?').bind(quoteId).first<{r2_key:string;filename:string;size_bytes:number;sha256:string}>();
 if(!row)return c.json({error:'Sin copia firmada'},404);
 const file=await c.env.BUCKET.get(row.r2_key);if(!file||file.size!==row.size_bytes||file.size>maxDocumentBytes)return c.json({error:'Copia no disponible o tamaño incompatible'},409);
 const bytes=new Uint8Array(await file.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==row.sha256)return c.json({error:'Integridad de la copia no confirmada'},409);
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return c.json({filename:row.filename,pdf:btoa(raw),sha256:hash});
});
