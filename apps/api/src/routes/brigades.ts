/**
 * Bonaire: catálogo PRIVADO de brigadas (fase 1B).
 * No asigna trabajos, no cambia citas y no expone integrantes al público.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth, requireStaffAuth } from '../middleware';

export const brigadeRoutes = new Hono<{Bindings:Env;Variables:{user?:any}}>();
brigadeRoutes.use('*',requireStaffAuth);

type Values={name?:string;leader_name?:string;specialty?:string|null;is_active?:boolean};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const allowed=(b:Record<string,unknown>,keys:string[])=>Object.keys(b).every(k=>keys.includes(k));
const trim=(v:unknown,max:number):string|null=>typeof v==='string'&&v.length<=max+60&&
  v.trim().length<=max?v.trim():null;
function validateBrigade(b:unknown,partial=false):{value?:Values;error?:string}{
  if(!object(b)||!allowed(b,['name','leader_name','specialty','is_active','expected_updated_at']))
    return {error:'Campos de brigada no admitidos.'};
  if(!partial&&(b.name===undefined||b.leader_name===undefined))
    return {error:'Indica nombre y jefe de brigada.'};
  const value:Values={};
  if(b.name!==undefined){const v=trim(b.name,120);if(!v||v.length<3)return {error:'Nombre de brigada inválido (3-120 caracteres).'};value.name=v;}
  if(b.leader_name!==undefined){const v=trim(b.leader_name,120);if(!v||v.length<3)return {error:'Nombre del jefe inválido (3-120 caracteres).'};value.leader_name=v;}
  if(b.specialty!==undefined){
    const v=b.specialty===null?null:trim(b.specialty,300);
    if(v===null&&b.specialty!==null)return {error:'Especialidad demasiado larga.'};
    value.specialty=v||null;
  }
  if(b.is_active!==undefined){
    if(!partial||typeof b.is_active!=='boolean')return {error:'Estado de brigada inválido.'};
    value.is_active=b.is_active;
  }
  if(!Object.keys(value).length)return {error:'No se indicaron cambios.'};
  return {value};
}
function validateMember(b:unknown,partial=false):{value?:{full_name?:string;function_name?:string|null;is_active?:boolean};error?:string}{
  if(!object(b)||!allowed(b,['full_name','function_name','is_active','expected_updated_at']))
    return {error:'Campos de integrante no admitidos.'};
  if(!partial&&b.full_name===undefined)return {error:'Indica el nombre del integrante.'};
  const value:{full_name?:string;function_name?:string|null;is_active?:boolean}={};
  if(b.full_name!==undefined){const v=trim(b.full_name,120);if(!v||v.length<3)return {error:'Nombre de integrante inválido.'};value.full_name=v;}
  if(b.function_name!==undefined){
    const v=b.function_name===null?null:trim(b.function_name,100);
    if(v===null&&b.function_name!==null)return {error:'Función demasiado larga.'};
    value.function_name=v||null;
  }
  if(b.is_active!==undefined){
    if(!partial||typeof b.is_active!=='boolean')return {error:'Estado de integrante inválido.'};
    value.is_active=b.is_active;
  }
  if(!Object.keys(value).length)return {error:'No se indicaron cambios.'};
  return {value};
}
function audit(env:Env,actor:string,action:string,kind:string,id:string,details:object){
  return env.DB.prepare('INSERT INTO audit_logs (id,admin_user_id,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,kind,id,JSON.stringify(details),new Date().toISOString());
}
function duplicate(err:unknown){return /unique constraint|unique index/i.test(err instanceof Error?err.message:String(err));}
async function present(env:Env){
  const [bs,ms]=await Promise.all([
    env.DB.prepare("SELECT b.id,b.name,b.leader_name,b.specialty,b.is_active,b.created_at,b.updated_at,(SELECT COUNT(*) FROM brigade_work w WHERE w.brigade_id=b.id AND w.status IN ('scheduled','pending_approval')) AS open_work_count FROM brigades b ORDER BY b.is_active DESC,b.name ASC LIMIT 200").all(),
    env.DB.prepare('SELECT id,brigade_id,full_name,function_name,is_active,created_at,updated_at FROM brigade_members ORDER BY is_active DESC,full_name ASC LIMIT 1000').all()
  ]);
  return {brigades:bs.results||[],members:ms.results||[]};
}
brigadeRoutes.get('/',async c=>c.json(await present(c.env)));

brigadeRoutes.post('/',requireAdminAuth,async c=>{
  const parsed=validateBrigade(await c.req.json().catch(()=>null));
  if(parsed.error)return c.json({error:parsed.error},400);
  const v=parsed.value!,id=crypto.randomUUID(),now=new Date().toISOString();
  try{
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO brigades(id,name,leader_name,specialty,is_active,created_by,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)')
        .bind(id,v.name,v.leader_name,v.specialty??null,c.var.user!.user_id,now,now),
      audit(c.env,c.var.user!.user_id,'brigade_created','brigade',id,{name:v.name})
    ]);
  }catch(err){if(duplicate(err))return c.json({error:'Ya existe una brigada con ese nombre.'},409);throw err;}
  return c.json({id,message:'Brigada creada.'},201);
});

brigadeRoutes.patch('/:id',requireAdminAuth,async c=>{
  const id=c.req.param('id');
  if(!id)return c.json({error:'Identificador de brigada inválido.'},400);
  const body=await c.req.json().catch(()=>null),parsed=validateBrigade(body,true);
  if(parsed.error)return c.json({error:parsed.error},400);
  const expected=object(body)&&typeof body.expected_updated_at==='string'?body.expected_updated_at:'';
  if(!expected)return c.json({error:'Actualiza la ficha antes de guardar.'},400);
  const old=await c.env.DB.prepare('SELECT id,name,leader_name,specialty,is_active,updated_at FROM brigades WHERE id=?').bind(id).first<any>();
  if(!old)return c.json({error:'Brigada inexistente.'},404);
  const v=parsed.value!;
  if(v.is_active===false&&Boolean(old.is_active)){
    const busy=await c.env.DB.prepare("SELECT 1 FROM brigade_work WHERE brigade_id=? AND status IN ('scheduled','pending_approval') LIMIT 1").bind(id).first();
    if(busy)return c.json({error:'No es posible desactivar una brigada con trabajos pendientes o programados.'},409);
  }
  const next={...old,...v},now=new Date().toISOString();
  try{
    const updated=await c.env.DB.prepare('UPDATE brigades SET name=?,leader_name=?,specialty=?,is_active=?,updated_at=? WHERE id=? AND updated_at=?')
      .bind(next.name,next.leader_name,next.specialty??null,next.is_active?1:0,now,id,expected).run();
    if(!updated.meta?.changes)return c.json({error:'La brigada cambió. Actualiza la lista antes de guardar.'},409);
  }catch(err){if(duplicate(err))return c.json({error:'Ya existe una brigada con ese nombre.'},409);throw err;}
  await audit(c.env,c.var.user!.user_id,'brigade_updated','brigade',id,{fields:Object.keys(v)}).run();
  return c.json({message:'Brigada actualizada.'});
});

brigadeRoutes.post('/:id/members',requireAdminAuth,async c=>{
  const brigadeId=c.req.param('id'),parsed=validateMember(await c.req.json().catch(()=>null));
  if(parsed.error)return c.json({error:parsed.error},400);
  const exists=await c.env.DB.prepare('SELECT id FROM brigades WHERE id=? AND is_active=1').bind(brigadeId).first();
  if(!exists)return c.json({error:'La brigada no existe o está inactiva.'},404);
  const v=parsed.value!,id=crypto.randomUUID(),now=new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO brigade_members(id,brigade_id,full_name,function_name,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
      .bind(id,brigadeId,v.full_name,v.function_name??null,now,now),
    audit(c.env,c.var.user!.user_id,'brigade_member_created','brigade_member',id,{brigade_id:brigadeId})
  ]);
  return c.json({id,message:'Integrante registrado.'},201);
});

brigadeRoutes.patch('/:id/members/:memberId',requireAdminAuth,async c=>{
  const brigadeId=c.req.param('id'),id=c.req.param('memberId');
  if(!brigadeId||!id)return c.json({error:'Identificador de brigada o integrante inválido.'},400);
  const body=await c.req.json().catch(()=>null);
  const parsed=validateMember(body,true);
  if(parsed.error)return c.json({error:parsed.error},400);
  const expected=object(body)&&typeof body.expected_updated_at==='string'?body.expected_updated_at:'';
  if(!expected)return c.json({error:'Actualiza la ficha antes de guardar.'},400);
  const old=await c.env.DB.prepare('SELECT id,full_name,function_name,is_active FROM brigade_members WHERE id=? AND brigade_id=?')
    .bind(id,brigadeId).first<any>();
  if(!old)return c.json({error:'Integrante no encontrado.'},404);
  const v=parsed.value!,next={...old,...v};
  const result=await c.env.DB.prepare('UPDATE brigade_members SET full_name=?,function_name=?,is_active=?,updated_at=? WHERE id=? AND brigade_id=? AND updated_at=?')
    .bind(next.full_name,next.function_name??null,next.is_active?1:0,new Date().toISOString(),id,brigadeId,expected).run();
  if(!result.meta?.changes)return c.json({error:'El integrante cambió. Actualiza la lista.'},409);
  await audit(c.env,c.var.user!.user_id,'brigade_member_updated','brigade_member',id,
    {brigade_id:brigadeId,fields:Object.keys(v)}).run();
  return c.json({message:'Integrante actualizado.'});
});
