/** Telegram Mini App identity (Bot API signed initData). Never trust initDataUnsafe. */
import type {Env} from './types';
const enc=new TextEncoder();
async function hmac(key:BufferSource,message:string):Promise<ArrayBuffer>{
 const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return crypto.subtle.sign('HMAC',k,enc.encode(message));
}
export async function verifiedTelegramUser(initData:unknown,token:string|undefined,now=Math.floor(Date.now()/1000)):Promise<string|null>{
 if(!token||typeof initData!=='string'||!initData||initData.length>12000)return null;
 try{
  const p=new URLSearchParams(initData),seen=new Set<string>();
  for(const [key] of p){if(seen.has(key))return null;seen.add(key);}
  const hash=p.get('hash')||'',date=p.get('auth_date')||'';
  if(!/^[0-9a-f]{64}$/.test(hash)||!/^\d{1,12}$/.test(date))return null;
  const age=now-Number(date);if(age< -30||age>600)return null;
  p.delete('hash');
  const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
  const key=await hmac(enc.encode('WebAppData'),token);
  const actual=new Uint8Array(await hmac(key,check));
  let diff=0;for(let i=0;i<32;i++)diff|=actual[i]^parseInt(hash.slice(i*2,i*2+2),16);
  if(diff!==0)return null;
  const user=JSON.parse(p.get('user')||'null');
  if(!user||user.is_bot===true||!Number.isSafeInteger(user.id)||user.id<=0)return null;
  return String(user.id);
 }catch{return null;}
}
export async function currentTelegramCustomer(env:Env,chatId:string):Promise<{id:string;name:string}|null>{
 // Only independently verified customer identity is trusted. Legacy links never authorize access.
 const {results}=await env.DB.prepare("SELECT id,name FROM customers WHERE telegram_customer_chat_id=? LIMIT 2")
  .bind(chatId).all<{id:string;name:string}>();
 if(results?.length!==1)return null;
 return env.DB.prepare("SELECT id,name FROM customers WHERE id=? AND telegram_customer_chat_id=? AND is_active=1 AND password_hash IS NOT NULL")
  .bind(results[0].id,chatId).first<{id:string;name:string}>();
}
