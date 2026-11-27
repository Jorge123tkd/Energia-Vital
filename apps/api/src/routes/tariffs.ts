import { Hono } from 'hono';
import type { Env } from '../types';
import { requireStaffAuth,requireAdminAuth } from '../middleware';
export const tariffRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
tariffRoutes.use('*',requireStaffAuth);
tariffRoutes.use('*',async(c,next)=>{
 c.header('Cache-Control','private, no-store');
 if(!await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='commercial_tariff_versions'").first())return c.json({error:'Tarifario pendiente de habilitación (migración 029).'},503);
 await next();
});
const code=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9_-]{3,80}$/.test(v);
const cents=(v:unknown)=>v===null||typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=99999999999;
const categories=['labor','material','transport','handling','other'];
const units=['unit','m','m2','kg','set','hour','visit','trip','service'];
export function validTariff(b:any):boolean{
 return !!b&&Object.keys(b).sort().join(',')==='active,category,code,conditions,cost_cents,expected_revision,name,sale_cents,service_id,unit'&&code(b.code)&&typeof b.name==='string'&&b.name.trim().length>=3&&b.name.trim().length<=150&&categories.includes(b.category)&&units.includes(b.unit)&&(b.service_id===null||typeof b.service_id==='string'&&b.service_id.length>=1&&b.service_id.length<=128)&&cents(b.sale_cents)&&cents(b.cost_cents)&&typeof b.conditions==='string'&&b.conditions.length<=500&&typeof b.active==='boolean'&&Number.isSafeInteger(b.expected_revision)&&b.expected_revision>=0&&b.expected_revision<1000000;
}
tariffRoutes.get('/',async c=>{
 const after=c.req.query('after')||'',search=(c.req.query('search')||'').trim();
 if((after&&!code(after))||search.length>100)return c.json({error:'Búsqueda inválida'},400);
 const rows=(await c.env.DB.prepare("SELECT code,revision,name,category,unit,sale_cents,conditions,service_id FROM commercial_tariffs WHERE active=1 AND sale_cents IS NOT NULL AND code>? AND instr(lower(name),lower(?))>0 ORDER BY code LIMIT 51").bind(after,search).all()).results||[];
 return c.json({tariffs:rows.slice(0,50),next:rows.length>50?rows[49].code:null});
});
// Existing product prices are suggestions only, never stock or purchase cost.
tariffRoutes.get('/products',async c=>{
 const after=c.req.query('after')||'',search=(c.req.query('search')||'').trim();
 if(after.length>128||search.length>100)return c.json({error:'Consulta inválida'},400);
 const rows=(await c.env.DB.prepare("SELECT id,name,brand,model,price FROM products WHERE is_active=1 AND currency='USD' AND typeof(price) IN ('integer','real') AND price>0 AND price<=999999999.99 AND id>? AND instr(lower(name||' '||COALESCE(brand,'')||' '||COALESCE(model,'')),lower(?))>0 ORDER BY id LIMIT 51").bind(after,search).all<{id:string;name:string;brand:string|null;model:string|null;price:number}>()).results||[];
 return c.json({tariffs:rows.slice(0,50).map(p=>({code:p.id,name:[p.name,p.brand,p.model].filter(Boolean).join(' · ').slice(0,160),unit:'unit',sale_cents:Math.round(p.price*100)})),next:rows.length>50?rows[49].id:null});
});
tariffRoutes.get('/manage/services',requireAdminAuth,async c=>{
 const after=c.req.query('after')||'',search=(c.req.query('search')||'').trim();
 if(after.length>128||search.length>100)return c.json({error:'Consulta inválida'},400);
 const rows=(await c.env.DB.prepare("SELECT id,name FROM services WHERE is_active=1 AND id>? AND instr(lower(name),lower(?))>0 ORDER BY id LIMIT 51").bind(after,search).all()).results||[];
 return c.json({services:rows.slice(0,50),next:rows.length>50?rows[49].id:null});
});
tariffRoutes.get('/manage',requireAdminAuth,async c=>{
 const after=c.req.query('after')||'';
 if(after&&!code(after))return c.json({error:'Cursor inválido'},400);
 const rows=(await c.env.DB.prepare("SELECT code,revision,name,category,unit,service_id,sale_cents,cost_cents,conditions,active,created_at FROM commercial_tariffs WHERE code>? ORDER BY code LIMIT 51").bind(after).all()).results||[];
 return c.json({tariffs:rows.slice(0,50),next:rows.length>50?rows[49].code:null});
});
tariffRoutes.post('/manage',requireAdminAuth,async c=>{
 const size=Number(c.req.header('content-length')||'0');if(size>8192)return c.json({error:'Solicitud demasiado grande'},413);
 const raw=await c.req.text();if(new TextEncoder().encode(raw).length>8192)return c.json({error:'Solicitud demasiado grande'},413);
 let b:any;try{b=JSON.parse(raw)}catch{return c.json({error:'JSON inválido'},400)}
 if(!validTariff(b))return c.json({error:'Revisa código, unidad, precios USD y revisión.'},400);
 const actor=c.var.user!.user_id;
 try{
  const r=await c.env.DB.prepare("INSERT INTO commercial_tariff_versions(code,revision,name,category,unit,service_id,sale_cents,cost_cents,conditions,active,created_by,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM admin_users WHERE id=? AND role='admin' AND is_active=1) AND (? IS NULL OR EXISTS(SELECT 1 FROM services WHERE id=? AND is_active=1)) AND COALESCE((SELECT MAX(revision) FROM commercial_tariff_versions WHERE code=?),0)=?").bind(b.code,b.expected_revision+1,b.name.trim(),b.category,b.unit,b.service_id,b.sale_cents,b.cost_cents,b.conditions.trim(),b.active?1:0,actor,new Date().toISOString(),actor,b.service_id,b.service_id,b.code,b.expected_revision).run();
  if(r.meta?.changes!==1)return c.json({error:'La tarifa cambió o el servicio no está disponible. Actualiza antes de guardar.'},409);
  return c.json({code:b.code,revision:b.expected_revision+1},201);
 }catch(e){if(/constraint|tariff_/i.test(String(e)))return c.json({error:'Conflicto de revisión o datos no válidos.'},409);throw e}
});
