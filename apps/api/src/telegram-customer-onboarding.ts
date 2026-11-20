/** Customer onboarding is separate from staff OTP and general AI/chat history. */
import type { Env } from './types';
export const SITE_URL='https://bnergiv.com';
export type Stage='name'|'phone'|'email'|'address'|'city'|'province'|'password';
export type Draft={chat_id:string;draft_id:string;stage:Stage;data_json:string;expires_at:string;last_update_id:string};
const fields:Stage[]=['name','phone','email','address','city','province','password'];
const prompts:Record<Stage,string>={
 name:'¿Cuál es tu nombre completo?',
 phone:'¿Cuál es tu número de teléfono de contacto? Incluye el prefijo del país.',
 email:'¿Cuál es tu correo electrónico? Lo usarás para entrar a Bonaire.',
 address:'¿Cuál es tu dirección? Incluye calle, número y referencia.',
 city:'¿En qué municipio vives?',
 province:'¿En qué provincia vives?',
 password:'¡Listo! Abre el formulario seguro para establecer tu contraseña. No la escribas en el chat.'
};
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export const startsRegistration=(s:string)=>/^(?:crear cuenta|crear cuenta de cliente|registrarme|registro de cliente)$/.test(norm(s));
export const cancelsRegistration=(s:string)=>/^(?:cancelar|cancelar registro|\/cancelar|nuevo chat|nueva conversacion|borrar historial)$/.test(norm(s));
export const isCustomerCode=(s:string)=>/^BV-[0-9A-F]{16}$/i.test(s.trim());
export function registrationPrompt(stage:Stage){return prompts[stage];}
export function advanceRegistration(stage:Stage,input:string){
 const value=input.trim();
 if(stage==='password')return null;
 const limits:Record<string,number>={name:120,phone:25,email:254,address:250,city:100,province:100};
 if(value.length>(limits[stage]||0))return null;
 const valid=stage==='phone'?/^[+0-9 ()-]{8,20}$/.test(value)&&(value.match(/\d/g)||[]).length>=8:
 stage==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value):
 value.length>=(stage==='address'?6:stage==='name'?3:2);
 if(!valid)return null;
 return {field:stage,value:stage==='email'?value.toLowerCase():value,next:fields[fields.indexOf(stage)+1]};
}
export async function activeRegistration(env:Env,chatId:string):Promise<Draft|null>{
 return env.DB.prepare('SELECT * FROM telegram_customer_registration_drafts WHERE chat_id=? AND expires_at>?')
  .bind(chatId,new Date().toISOString()).first<Draft>();
}
export async function startRegistration(env:Env,chatId:string,updateId:string):Promise<Draft>{
 const current=await activeRegistration(env,chatId);
 if(current)return current;
 const expires=new Date(Date.now()+30*60*1000).toISOString(),id=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO telegram_customer_registration_drafts(chat_id,draft_id,stage,data_json,expires_at,last_update_id) VALUES(?,?,'name','{}',?,?) ON CONFLICT(chat_id) DO UPDATE SET draft_id=excluded.draft_id,stage='name',data_json='{}',expires_at=excluded.expires_at,last_update_id=excluded.last_update_id WHERE telegram_customer_registration_drafts.expires_at<=?")
 .bind(chatId,id,expires,updateId,new Date().toISOString()).run();
 const saved=await activeRegistration(env,chatId);if(!saved)throw Error('No se pudo iniciar el registro');
 return saved;
}
export async function saveRegistrationStep(env:Env,draft:Draft,input:string,updateId:string):Promise<{stage:Stage;valid:boolean}>{
 if(draft.last_update_id===updateId)return {stage:draft.stage,valid:true};
 const step=advanceRegistration(draft.stage,input);
 if(!step)return {stage:draft.stage,valid:false};
 const data=JSON.parse(draft.data_json) as Record<string,string>;
 data[step.field]=step.value;
 const saved=await env.DB.prepare('UPDATE telegram_customer_registration_drafts SET stage=?,data_json=?,last_update_id=? WHERE chat_id=? AND draft_id=? AND stage=? AND last_update_id=? AND expires_at>?')
 .bind(step.next,JSON.stringify(data),updateId,draft.chat_id,draft.draft_id,draft.stage,draft.last_update_id,new Date().toISOString()).run();
 if(saved.meta.changes!==1){const latest=await activeRegistration(env,draft.chat_id);return {stage:latest?.stage||draft.stage,valid:false};}
 return {stage:step.next,valid:true};
}
export async function cancelRegistration(env:Env,chatId:string){
 await env.DB.prepare('DELETE FROM telegram_customer_registration_drafts WHERE chat_id=?').bind(chatId).run();
}
export async function codeDigest(code:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('customer-telegram:'+code.trim().toUpperCase()));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function newCustomerCode(){
 return 'BV-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
export async function issueCustomerCode(env:Env,customerId:string){
 const code=newCustomerCode(),created=new Date().toISOString(),expires=new Date(Date.now()+10*60*1000).toISOString();
 const result=await env.DB.prepare("INSERT INTO telegram_customer_link_codes(customer_id,code_hash,expires_at,created_at) SELECT id,?,?,? FROM customers WHERE id=? AND is_active=1 AND password_hash IS NOT NULL AND telegram_customer_chat_id IS NULL ON CONFLICT(customer_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,created_at=excluded.created_at WHERE telegram_customer_link_codes.created_at<=?")
 .bind(await codeDigest(code),expires,created,customerId,new Date(Date.now()-60*1000).toISOString()).run();
 return result.meta.changes===1?{code,expires_at:expires}:null;
}
export async function redeemCustomerCode(env:Env,chatId:string,code:string){
 if(!isCustomerCode(code))return false;
 const hash=await codeDigest(code),time=new Date().toISOString();
 // D1.batch is transactional. The conditional UPDATE and deletion consume a code once.
 const result=await env.DB.batch([
  env.DB.prepare("UPDATE customers SET telegram_customer_chat_id=?,updated_at=? WHERE id=(SELECT customer_id FROM telegram_customer_link_codes WHERE code_hash=? AND expires_at>?) AND is_active=1 AND password_hash IS NOT NULL AND telegram_customer_chat_id IS NULL AND NOT EXISTS(SELECT 1 FROM customers WHERE telegram_customer_chat_id=?)")
   .bind(chatId,time,hash,time,chatId),
  env.DB.prepare('DELETE FROM telegram_customer_link_codes WHERE code_hash=?').bind(hash)
 ]);
 return result[0].meta.changes===1;
}
export async function cleanTelegramOnboarding(env:Env,at:Date){
 const time=at.toISOString();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM telegram_customer_registration_drafts WHERE expires_at<=?').bind(time),
  env.DB.prepare('DELETE FROM telegram_customer_link_codes WHERE expires_at<=?').bind(time)
 ]);
}
export async function notifyCustomerOnboarding(env:Env,chatId:string,text:string){
 if(!env.TELEGRAM_BOT_TOKEN)return;
 try{
  await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'Entrar en Bonaire',url:SITE_URL+'/entrar'}]]}}),signal:AbortSignal.timeout(7000)});
 }catch{/* Account already saved; never log request or token. */}
}
