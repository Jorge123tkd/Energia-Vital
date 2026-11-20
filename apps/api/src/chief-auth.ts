/** Sesión del jefe de brigada, aislada de JwtPayload/customer/admin.
 * El token bruto jamás persiste en D1. No concede derechos al panel admin.
 */
import type { Context, Next } from 'hono';
import type { Env } from './types';
export type ChiefIdentity={id:string;brigade_id:string;email:string};
type ChiefContext=Context<{Bindings:Env;Variables:{chief?:ChiefIdentity}}>;
const hex=(bytes:Uint8Array)=>Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function tokenDigest(token:string):Promise<string>{
  const bytes=new TextEncoder().encode(token);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
export async function createChiefSession(env:Env,id:string){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=hex(bytes);
  const now=new Date();
  const expires=new Date(now.getTime()+8*60*60*1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO brigade_chief_sessions(id,chief_id,token_hash,created_at,expires_at) '+
    'VALUES (?,?,?,?,?)'
  ).bind(crypto.randomUUID(),id,await tokenDigest(token),now.toISOString(),expires).run();
  return {access_token:token,expires_at:expires,token_type:'Bearer'};
}
export async function currentChief(c:ChiefContext):Promise<ChiefIdentity|null>{
  const authorization=c.req.header('authorization')||'';
  if(!/^Bearer [0-9a-f]{64}$/.test(authorization))return null;
  const raw=authorization.slice(7);
  const digest=await tokenDigest(raw);
  const account=await c.env.DB.prepare(
    'SELECT a.id,a.brigade_id,a.email FROM brigade_chief_sessions s '+
    'JOIN brigade_chief_accounts a ON a.id=s.chief_id '+
    'JOIN brigades b ON b.id=a.brigade_id '+
    'WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? '+
    'AND a.is_active=1 AND b.is_active=1'
  ).bind(digest,new Date().toISOString()).first<ChiefIdentity>();
  return account||null;
}
export async function requireChief(c:ChiefContext,next:Next){
  const account=await currentChief(c);
  if(!account)return c.json({error:'Sesión de jefe inválida o caducada.'},401);
  c.set('chief',account);
  await next();
}
