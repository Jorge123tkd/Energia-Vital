import type {Env} from './types';
import {cubaToday} from './brigade-policy';
export async function quoteDecisionsAvailable(env:Env){return !!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='commercial_quote_decisions'").first()}
export async function recordQuoteDecision(env:Env,id:string,body:unknown,actor:string,source:'customer'|'staff_evidence'){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!body||typeof body!=='object'||Array.isArray(body))return {status:400,error:'Respuesta inválida.'};
 const b=body as Record<string,unknown>,keys=source==='customer'?['decision','note']:['decision','note','evidence'];
 if(Object.keys(b).some(k=>!keys.includes(k))||!['accept','changes','reject'].includes(String(b.decision))||typeof b.note!=='string'||b.note.length>1000||(b.decision==='changes'&&b.note.trim().length<3)||(source==='staff_evidence'&&(typeof b.evidence!=='string'||b.evidence.trim().length<12||b.evidence.length>1000)))return {status:400,error:'Indica la decisión, modificaciones solicitadas y evidencia cuando corresponda.'};
 if(!await quoteDecisionsAvailable(env))return {status:503,error:'Respuestas comerciales pendientes de habilitación.'};
 const customer=source==='customer'?actor:null,staff=source==='staff_evidence'?actor:null,note=b.note.trim(),evidence=typeof b.evidence==='string'?b.evidence.trim():null;
 // Ownership is checked before disclosing even the existence of a response.
 const q=await env.DB.prepare("SELECT q.id FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id WHERE q.id=? AND (? IS NULL OR (r.customer_id=? AND EXISTS(SELECT 1 FROM notifications n WHERE n.id='quote-issued-'||q.id AND n.user_id=? AND n.user_type='customer')))").bind(id,customer,customer,customer).first();
 if(!q)return {status:404,error:'Propuesta no disponible.'};
 const read=()=>env.DB.prepare('SELECT decision,note,source,customer_id,actor_id,evidence,decided_at FROM commercial_quote_decisions WHERE quote_id=?').bind(id).first<{decision:string;note:string;source:string;customer_id:string|null;actor_id:string|null;evidence:string|null;decided_at:string}>();
 const same=(r:Awaited<ReturnType<typeof read>>)=>!!r&&r.decision===b.decision&&r.note===note&&r.source===source&&r.customer_id===customer&&r.actor_id===staff&&r.evidence===evidence;
 let prior=await read();if(prior)return same(prior)?{status:200,decision:prior.decision,decided_at:prior.decided_at}:{status:409,error:'Ya existe una decisión registrada. Consulta al equipo.'};
 try{await env.DB.prepare('INSERT INTO commercial_quote_decisions(quote_id,decision,note,source,customer_id,actor_id,evidence,decided_at,cuba_date) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,b.decision,note,source,customer,staff,evidence,new Date().toISOString(),cubaToday()).run()}
 catch(e){if(!/constraint|quote_decision/i.test(String(e)))throw e;prior=await read();if(!same(prior))return {status:409,error:'La propuesta venció, fue sustituida o ya existe una aceptación. Contacta con Bonaire.'};}
 const r=await read();return same(r)?{status:200,decision:r!.decision,decided_at:r!.decided_at}:{status:409,error:'Respuesta no confirmada.'};
}
