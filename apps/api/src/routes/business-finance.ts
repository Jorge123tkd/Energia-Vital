// Operational finance pilot. Explicit manual evidence, not a banking integration.
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth } from '../middleware';
import { cubaToday,validCubanWorkDate } from '../brigade-policy';
export const businessFinanceRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
businessFinanceRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(c.env.BUSINESS_FINANCE_ENABLED!=='true'||c.env.WAREHOUSE_ENABLED!=='true')return c.json({error:'Economía empresarial aún no habilitada'},503);
 await next();
});
businessFinanceRoutes.use('*',requireAdminAuth);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const str=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;
const date=(v:unknown):v is string=>typeof v==='string'&&validCubanWorkDate(v);
const money=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=1000000000000;
const categories=new Set(['goods','freight','customs','insurance','installation','labor','other']);
const currencies=new Set(['USD','CUP','EUR','CNY']);
const admin="EXISTS(SELECT 1 FROM admin_users WHERE id=? AND is_active=1 AND role='admin')";
const conflict=(e:unknown)=>/business_|constraint|unique/i.test(e instanceof Error?e.message:String(e));
async function body(req:Request):Promise<Record<string,unknown>|null>{
 if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
 try{
  const reader=req.body?.getReader();if(!reader)return null;
  let size=0,raw='';const decoder=new TextDecoder();
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>8192){await reader.cancel();return null;}raw+=decoder.decode(r.value,{stream:true})}
  const b=JSON.parse(raw+decoder.decode());return b&&typeof b==='object'&&!Array.isArray(b)?b:null;
 }catch{return null}
}
businessFinanceRoutes.get('/projects/:project',async c=>{
 const project=c.req.param('project'),actor=c.var.user!.user_id,db=c.env.DB;
 if(!id(project))return c.json({error:'Proyecto inválido'},400);
 const link=await db.prepare('SELECT project_id,request_id FROM warehouse_project_links WHERE project_id=? AND '+admin).bind(project,actor).first();
 if(!link)return c.json({error:'Proyecto no vinculado'},404);
 const [receivable,obligations,commitments]=await Promise.all([
  db.prepare('SELECT * FROM business_project_receivables WHERE project_id=? AND '+admin).bind(project,actor).first(),
  db.prepare('SELECT * FROM business_project_obligations WHERE project_id=? AND '+admin+' ORDER BY currency,category').bind(project,actor).all(),
  db.prepare('SELECT * FROM business_purchase_commitments WHERE project_id=? AND '+admin+' ORDER BY currency').bind(project,actor).all()
 ]);
 return c.json({project:link,receivable,obligations:obligations.results||[],uninvoicedCommitments:commitments.results||[],currencyConversion:false,profitCalculated:false,manualEvidenceOnly:true});
});
businessFinanceRoutes.get('/payables',async c=>{
 const after=c.req.query('after')||'',actor=c.var.user!.user_id;
 if(after&&!id(after))return c.json({error:'Cursor inválido'},400);
 const r=await c.env.DB.prepare('SELECT p.*,s.name AS supplier_name FROM business_payables p JOIN procurement_suppliers s ON s.id=p.supplier_id WHERE p.id>? AND '+admin+' ORDER BY p.id LIMIT 51').bind(after,actor).all();
 const rows=r.results||[],page=rows.slice(0,50);
 return c.json({payables:page,next:rows.length>50?page.at(-1)!.id:null});
});
businessFinanceRoutes.post('/projects/:project/contract',async c=>{
 const project=c.req.param('project'),actor=c.var.user!.user_id,db=c.env.DB,b=await body(c.req.raw);
 if(!id(project)||!b||Object.keys(b).sort().join(',')!=='acceptedOn,acceptanceEvidence,contractReference,dueOn,quoteId'||!id(b.quoteId)||!str(b.contractReference,3,200)||!str(b.acceptanceEvidence,15,900)||!date(b.acceptedOn)||b.acceptedOn>cubaToday()||(b.dueOn!==null&&(!date(b.dueOn)||b.dueOn<b.acceptedOn)))return c.json({error:'Contrato o evidencia inválida'},400);
 const reference=b.contractReference.trim(),evidence=b.acceptanceEvidence.trim();
 const lookup=()=>db.prepare('SELECT * FROM business_project_contracts WHERE project_id=? AND '+admin).bind(project,actor).first();
 const same=(r:Record<string,unknown>|null)=>!!r&&r.quote_id===b.quoteId&&r.contract_reference===reference&&r.acceptance_evidence===evidence&&r.accepted_on===b.acceptedOn&&r.due_on===b.dueOn&&r.recorded_by===actor;
 const prior=await lookup();
 if(prior)return same(prior)?c.json({contract:prior,replayed:true}):c.json({error:'Existe un contrato; requiere revisión formal'},409);
 try{
  await db.prepare('INSERT INTO business_project_contracts(project_id,quote_id,contract_reference,acceptance_evidence,accepted_on,due_on,recorded_by) SELECT ?,?,?,?,?,?,? WHERE '+admin+' ON CONFLICT(project_id) DO NOTHING').bind(project,b.quoteId,reference,evidence,b.acceptedOn,b.dueOn,actor,actor).run();
 }catch(e){if(!conflict(e))throw e;return c.json({error:'Cotización, proyecto o aceptación incompatible'},409)}
 const r=await lookup();return same(r)?c.json({contract:r},201):c.json({error:'Contrato no confirmado'},409);
});
businessFinanceRoutes.post('/obligations',async c=>{
 const b=await body(c.req.raw),actor=c.var.user!.user_id,db=c.env.DB;
 if(!b||Object.keys(b).sort().join(',')!=='amountMinor,category,currency,documentReference,dueOn,evidence,id,issuedOn,projectId,purchaseOrderId,supplierId'||!id(b.id)||!id(b.supplierId)||(b.projectId!==null&&!id(b.projectId))||(b.purchaseOrderId!==null&&!id(b.purchaseOrderId))||typeof b.category!=='string'||!categories.has(b.category)||typeof b.currency!=='string'||!currencies.has(b.currency)||!money(b.amountMinor)||!str(b.documentReference,3,200)||!str(b.evidence,15,900)||!date(b.issuedOn)||b.issuedOn>cubaToday()||(b.dueOn!==null&&(!date(b.dueOn)||b.dueOn<b.issuedOn)))return c.json({error:'Obligación inválida'},400);
 if(b.category==='goods'?b.purchaseOrderId===null:(b.purchaseOrderId!==null||b.projectId===null))return c.json({error:'Origen del gasto inválido'},400);
 const reference=b.documentReference.trim(),evidence=b.evidence.trim();
 const lookup=()=>db.prepare('SELECT * FROM business_obligations WHERE id=? AND '+admin).bind(b.id,actor).first();
 const same=(r:Record<string,unknown>|null)=>!!r&&r.project_id===b.projectId&&r.purchase_order_id===b.purchaseOrderId&&r.supplier_id===b.supplierId&&r.category===b.category&&r.currency===b.currency&&r.amount_minor===b.amountMinor&&r.document_reference===reference&&r.evidence===evidence&&r.issued_on===b.issuedOn&&r.due_on===b.dueOn&&r.recorded_by===actor;
 const prior=await lookup();
 if(prior)return same(prior)?c.json({obligation:prior,replayed:true}):c.json({error:'ID reutilizado'},409);
 try{
  await db.prepare('INSERT INTO business_obligations(id,project_id,purchase_order_id,supplier_id,category,currency,amount_minor,document_reference,evidence,issued_on,due_on,recorded_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE '+admin+' ON CONFLICT(id) DO NOTHING').bind(b.id,b.projectId,b.purchaseOrderId,b.supplierId,b.category,b.currency,b.amountMinor,reference,evidence,b.issuedOn,b.dueOn,actor,actor).run();
 }catch(e){if(!conflict(e))throw e;return c.json({error:'Documento duplicado o incompatible con el pedido'},409)}
 const r=await lookup();return same(r)?c.json({obligation:r},201):c.json({error:'Obligación no confirmada'},409);
});
businessFinanceRoutes.post('/supplier-payments',async c=>{
 const b=await body(c.req.raw),actor=c.var.user!.user_id,db=c.env.DB;
 if(!b||Object.keys(b).sort().join(',')!=='amountMinor,currency,evidence,id,obligationId,paidOn,reference'||!id(b.id)||!id(b.obligationId)||!money(b.amountMinor)||typeof b.currency!=='string'||!currencies.has(b.currency)||!str(b.reference,4,150)||!str(b.evidence,15,900)||!date(b.paidOn)||b.paidOn>cubaToday())return c.json({error:'Pago documentado inválido'},400);
 const reference=b.reference.trim(),evidence=b.evidence.trim();
 const lookup=()=>db.prepare('SELECT p.*,o.currency FROM business_supplier_payments p JOIN business_obligations o ON o.id=p.obligation_id WHERE p.id=? AND '+admin).bind(b.id,actor).first();
 const same=(r:Record<string,unknown>|null)=>!!r&&r.obligation_id===b.obligationId&&r.amount_minor===b.amountMinor&&r.reference===reference&&r.evidence===evidence&&r.paid_on===b.paidOn&&r.recorded_by===actor&&r.currency===b.currency;
 const prior=await lookup();
 if(prior)return same(prior)?c.json({payment:prior,replayed:true}):c.json({error:'ID reutilizado'},409);
 try{
  await db.prepare('INSERT INTO business_supplier_payments(id,obligation_id,amount_minor,reference,paid_on,evidence,recorded_by) SELECT ?,o.id,?,?,?,?,? FROM business_obligations o WHERE o.id=? AND o.currency=? AND '+admin+' ON CONFLICT(id) DO NOTHING').bind(b.id,b.amountMinor,reference,b.paidOn,evidence,actor,b.obligationId,b.currency,actor).run();
 }catch(e){if(!conflict(e))throw e;return c.json({error:'Importe superior al saldo o referencia duplicada'},409)}
 const row=await lookup();return same(row)?c.json({payment:row},201):c.json({error:'Pago no confirmado; verifica obligación y moneda'},409);
});
