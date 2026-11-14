/**
 * Smoke local de rutas de Brigadas sin Cloudflare, red, credenciales ni D1 remoto.
 * Inyección de middleware simulado para comprobar permisos y flujos de entrada.
 * No sustituye pruebas de integración D1 con JWT reales.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),{Hono}=require('hono');
const src=fs.readFileSync(path.resolve(__dirname,'../src/routes/brigades.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const exported={exports:{}};
const requireFake=name=>{
  if(name==='hono')return {Hono};
  if(name==='../middleware')return {
    requireStaffAuth:async(c,next)=>{
      const header=c.req.header('authorization');
      if(!['Bearer admin','Bearer operator'].includes(header))return c.json({error:'No autorizado'},401);
      c.set('user',{user_id:header==='Bearer admin'?'admin-id':'operator-id'});
      await next();
    },
    requireAdminAuth:async(c,next)=>{
      if(c.req.header('authorization')!=='Bearer admin')return c.json({error:'Solo admin'},403);
      await next();
    }
  };
  throw Error('Dependencia inesperada '+name);
};
new Function('require','module','exports',js)(requireFake,exported,exported.exports);
const route=exported.exports.brigadeRoutes;
const brigades=[],members=[],audit=[];
const store={
  prepare(sql){
    const statement=(args=[])=>({
      bind(...params){return statement(params);},
      async first(){
        if(sql.includes('FROM brigades WHERE id=? AND is_active=1'))
          return brigades.find(b=>b.id===args[0]&&b.is_active)||null;
        if(sql.includes('FROM brigades WHERE id=?'))
          return brigades.find(b=>b.id===args[0])||null;
        if(sql.includes('FROM brigade_members WHERE id=? AND brigade_id=?'))
          return members.find(m=>m.id===args[0]&&m.brigade_id===args[1])||null;
        if(sql.includes('FROM brigade_work'))return null;
        throw Error('SQL first no simulado '+sql);
      },
      async all(){
        if(sql.includes('FROM brigades b ORDER BY'))return {results:brigades};
        if(sql.includes('FROM brigade_members ORDER BY'))return {results:members};
        throw Error('SQL all no simulado '+sql);
      },
      async run(){
        if(sql.startsWith('INSERT INTO brigades(')){
          const [id,name,leader_name,specialty,created_by,created_at,updated_at]=args;
          brigades.push({id,name,leader_name,specialty,is_active:1,created_by,created_at,updated_at,open_work_count:0});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO brigade_members(')){
          const [id,brigade_id,full_name,function_name,created_at,updated_at]=args;
          members.push({id,brigade_id,full_name,function_name,is_active:1,created_at,updated_at});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO audit_logs')){
          audit.push(args);return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE brigades SET')){
          const [name,leader_name,specialty,is_active,updated_at,id,expected]=args;
          const b=brigades.find(v=>v.id===id&&v.updated_at===expected);
          if(!b)return {meta:{changes:0}};
          Object.assign(b,{name,leader_name,specialty,is_active,updated_at});return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE brigade_members SET')){
          const [full_name,function_name,is_active,updated_at,id,brigade_id,expected]=args;
          const b=members.find(v=>v.id===id&&v.brigade_id===brigade_id&&v.updated_at===expected);
          if(!b)return {meta:{changes:0}};
          Object.assign(b,{full_name,function_name,is_active,updated_at});return {meta:{changes:1}};
        }
        throw Error('SQL run no simulado '+sql);
      }
    });
    return statement();
  },
  async batch(stmts){
    const results=[];
    for(const s of stmts)results.push(await s.run());
    return results;
  }
};
async function call(method,url,body,authorization){
  const headers={};
  if(authorization)headers.authorization='Bearer '+authorization;
  if(body!==undefined)headers['content-type']='application/json';
  const res=await route.request('http://test'+url,{
    method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})
  },{DB:store});
  let json;
  try{json=await res.json();}catch{json=null;}
  return {status:res.status,json};
}
(async()=>{
  assert.equal((await call('GET','/')).status,401,'Una cuenta anónima no ve brigadas');
  assert.equal((await call('GET','/',undefined,'operator')).status,200,'El gestor ve brigadas');
  assert.equal((await call('POST','/',{name:'Brigada A',leader_name:'Jefe de prueba'},'operator')).status,403,
    'El gestor no administra plantillas de brigada');
  assert.equal((await call('POST','/',{name:'Brigada A'},'admin')).status,400);
  assert.equal((await call('POST','/',{name:'A',leader_name:'Jefe de prueba'},'admin')).status,400);
  const created=await call('POST','/',{name:'Brigada de prueba',leader_name:'Jefe de prueba',specialty:'Solar'},'admin');
  assert.equal(created.status,201,JSON.stringify(created));
  const id=created.json.id;
  assert.equal(brigades.length,1);
  assert.equal(audit.length,1,'Creación registra auditoría');
  const found=await call('GET','/',undefined,'operator');
  assert.equal(found.json.brigades.length,1);
  assert.equal((await call('POST','/'+id+'/members',
    {full_name:'Integrante de prueba',function_name:'Instalador'},'operator')).status,403);
  const member=await call('POST','/'+id+'/members',
    {full_name:'Integrante de prueba',function_name:'Instalador'},'admin');
  assert.equal(member.status,201,JSON.stringify(member));
  assert.equal(members.length,1);
  assert.equal(audit.length,2,'Alta de integrante registra auditoría');
  assert.equal((await call('PATCH','/'+id,{name:'Cambiada'},'operator')).status,403);
  assert.equal((await call('PATCH','/'+id,{name:'Cambiada'},'admin')).status,400,
    'La edición exige control de versión');
  assert.equal((await call('PATCH','/'+id,
    {name:'Brigada corregida',expected_updated_at:'fecha-obsoleta'},'admin')).status,409,
    'La edición no debe sobrescribir cambios simultáneos');
  const updated=await call('PATCH','/'+id,{
    name:'Brigada corregida',expected_updated_at:brigades[0].updated_at
  },'admin');
  assert.equal(updated.status,200,JSON.stringify(updated));
  assert.equal(audit.length,3,'Edición registra auditoría');
  assert.equal((await call('PATCH','/'+id+'/members/'+member.json.id,
    {is_active:false,expected_updated_at:members[0].updated_at},'operator')).status,403);
  assert.equal((await call('PATCH','/'+id+'/members/'+member.json.id,
    {is_active:false,expected_updated_at:members[0].updated_at},'admin')).status,200);
  assert.equal(members[0].is_active,0);
  assert.equal(audit.length,4);
  console.log('PASS brigades-admin-smoke: lectura staff, escritura admin, integrantes, auditoría y conflictos de edición');
})().catch(e=>{console.error(e);process.exitCode=1;});
