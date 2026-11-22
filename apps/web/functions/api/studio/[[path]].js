// Read-only initial bridge. Production binding is never available to preview environments.
// Authentication is rechecked using the existing staff session; Studio independently checks membership.
const allowedHosts = new Set(['https://bnergiv.com','https://www.bnergiv.com','https://energia-vital-web.pages.dev']);
const safeId='[A-Za-z0-9_-]{1,100}';
const permitted = new RegExp('^/v1/(?:me|catalog(?:/'+safeId+')?|projects(?:/'+safeId+'/sections(?:/'+safeId+')?)?)$');
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const fail=(status,error)=>new Response(JSON.stringify({error}),{status,headers});
// Native pilot: no browser cookies, no new accounts, no public writes to projects.
const nativeRead = new RegExp('^/v1/(?:me|devices/'+safeId+'/projects(?:/'+safeId+'/changes)?)$');
const nativeOperation = new RegExp('^/v1/devices/'+safeId+'/operations$');
const adminRead = new RegExp('^/v1/admin/(?:conflicts|projects/'+safeId+'/backups/'+safeId+'/preview)$');
const adminPost = new RegExp('^/v1/admin/(?:conflicts/[1-9][0-9]{0,15}/resolve|projects/'+safeId+'/backups/'+safeId+')$');
const nativeWrite = new Set(['/v1/devices','/v1/activation/challenge','/v1/activation/complete']);
const bearer = token=>typeof token==='string'&&token.length<=4103&&/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
async function smallJson(request){
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw Error('invalid');
  const reader=request.body?.getReader();if(!reader)throw Error('invalid');
  let total=0,raw='';const decoder=new TextDecoder();
  while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>8192){await reader.cancel();throw Error('too large')}raw+=decoder.decode(chunk.value,{stream:true})}
  const value=JSON.parse(raw+decoder.decode());
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid');
  return value;
}
async function nativeRequest(request,env,url,path){
  // Browser pages must use their existing browser session. This check is not
  // authentication of a native binary; central Bearer validation is mandatory.
  if(url.origin!=='https://bnergiv.com'||request.headers.has('Origin')||request.headers.has('Sec-Fetch-Site')||request.headers.has('Cookie'))return fail(403,'Canal no autorizado');
  const method=request.method,auth=request.headers.get('Authorization')||'';
  const login=path==='/login',logout=path==='/logout';
  if(login||logout){if(method!=='POST'||url.search)return fail(405,'Método no habilitado')}
  else if(!(method==='GET'&&nativeRead.test(path))&&!(method==='POST'&&(nativeWrite.has(path)||nativeOperation.test(path))&&!url.search))return fail(404,'Ruta no disponible');
  if(url.search.length>1024)return fail(400,'Consulta inválida');
  if(!login&&!bearer(auth))return fail(401,'Debes iniciar sesión');
  if(!env?.STUDIO_API||!env?.ADMIN_SESSION_API)return fail(503,'Servicio Studio no configurado');
  const central=async(route,authorization,body)=>{
    const h=new Headers({'Accept':'application/json','Content-Type':'application/json'});
    if(authorization)h.set('Authorization',authorization);
    const ip=request.headers.get('CF-Connecting-IP');if(ip)h.set('CF-Connecting-IP',ip);
    return env.ADMIN_SESSION_API.fetch(new Request('https://bonaire.internal/api/auth/'+route,{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}));
  };
  const studio=(route,authorization,body)=>env.STUDIO_API.fetch(new Request('https://studio.internal'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:authorization,Accept:'application/json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}));
  const relay=async response=>{
    if(response.status>=300&&response.status<400||!response.headers.get('content-type')?.includes('application/json'))return fail(502,'Respuesta de Studio inválida');
    return new Response(response.body,{status:response.status,headers});
  };
  let issued=null;
  try{
    if(login){
      // Disabled deployments must not mint sessions. /v1/me denies anonymous
      // callers with 403 when enabled and 503 while the global gate is closed.
      const probe=await studio('/v1/me','');
      if(probe.status!==403)return fail(503,'Activación aún no habilitada');
      let b;try{b=await smallJson(request)}catch{return fail(400,'Solicitud inválida')}
      if(Object.keys(b).sort().join(',')!=='email,password'||typeof b.email!=='string'||b.email.length>254||typeof b.password!=='string'||!b.password||b.password.length>128)return fail(400,'Credenciales inválidas');
      const result=await central('login',null,{email:b.email,password:b.password});
      if(!result.ok)return fail([401,403,429].includes(result.status)?result.status:503,'No se pudo iniciar sesión');
      const data=await result.json();
      if(!bearer('Bearer '+data.access_token))return fail(502,'Respuesta de sesión inválida');
      issued='Bearer '+data.access_token;
      if(!data.user||!['admin','operator'].includes(data.user.role))return fail(403,'Acceso de personal no autorizado');
      const me=await studio('/v1/me',issued);
      if(!me.ok)return fail([401,403].includes(me.status)?403:503,'Cuenta no autorizada o Studio no disponible');
      const member=(await me.json()).user;
      if(member?.id!==data.user.id||!['admin','worker'].includes(member.role)||typeof member.email!=='string')return fail(403,'Identidad de Studio inválida');
      const response=new Response(JSON.stringify({access_token:data.access_token,user:{id:member.id,email:member.email,role:member.role}}),{status:200,headers});
      issued=null;return response;
    }
    if(logout){const r=await central('logout',auth,{});return r.ok?new Response('{"ok":true}',{headers}):fail(r.status===401?401:503,'No se confirmó el cierre de sesión')}
    const staff=await central('admin/me',auth);
    if(staff.status===401||staff.status===403)return fail(staff.status,'Acceso de personal no autorizado');
    if(!staff.ok)return fail(503,'No se pudo verificar la sesión');
    if(!['admin','operator'].includes((await staff.json()).user?.role))return fail(403,'Acceso de personal no autorizado');
    let b;if(method==='POST'){try{b=await smallJson(request)}catch{return fail(400,'Solicitud inválida')}}
    return relay(await studio(path+url.search,auth,b));
  }catch{return fail(503,'Servicio Studio temporalmente no disponible')}
  finally{if(issued){try{await central('logout',issued,{})}catch{}}}
}

export async function onRequest({request,env}){
  const url=new URL(request.url);
  if(!allowedHosts.has(url.origin))return fail(403,'Origen no autorizado');
  if(url.pathname.startsWith('/api/studio/native/'))return nativeRequest(request,env,url,url.pathname.slice('/api/studio/native'.length));
  const site=request.headers.get('Sec-Fetch-Site');
  if(site&&site!=='same-origin'&&site!=='none')return fail(403,'Origen no autorizado');
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return fail(403,'Origen no autorizado');
  const path=url.pathname.slice('/api/studio'.length);
  const adminOnly=adminRead.test(path)||adminPost.test(path);
  if(request.method!=='GET'&&!(request.method==='POST'&&adminPost.test(path)&&!url.search))return fail(405,'Método no habilitado');
  if(!url.pathname.startsWith('/api/studio/')||!(request.method==='GET'&&(permitted.test(path)||adminRead.test(path))||request.method==='POST'&&adminPost.test(path))||url.search.length>1024)return fail(404,'Ruta no disponible');
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)||authorization.length>4103)return fail(401,'Debes iniciar sesión');
  if(!env?.STUDIO_API||!env?.ADMIN_SESSION_API)return fail(503,'Servicio Studio no configurado');
  try{
    const auth=await env.ADMIN_SESSION_API.fetch(new Request('https://bonaire.internal/api/auth/admin/me',{headers:{Authorization:authorization},redirect:'manual'}));
    if(auth.status===401||auth.status===403)return fail(auth.status,'Acceso de personal no autorizado');
    if(!auth.ok)return fail(503,'No se pudo verificar la sesión');
    const staff=(await auth.json()).user;
    if(!staff||!['admin','operator'].includes(staff.role))return fail(403,'Acceso de personal no autorizado');
    if(adminOnly&&staff.role!=='admin')return fail(403,'Solo administrador');
    let payload;
    if(request.method==='POST'){try{payload=await smallJson(request)}catch{return fail(400,'Solicitud inválida')}}
    const upstream=await env.STUDIO_API.fetch(new Request('https://studio.internal'+path+url.search,{method:request.method,headers:{Authorization:authorization,Accept:'application/json','Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload),redirect:'manual'}));
    if(upstream.status>=300&&upstream.status<400)return fail(502,'Respuesta de Studio inválida');
    if(!upstream.headers.get('content-type')?.includes('application/json'))return fail(502,'Respuesta de Studio inválida');
    // Do not propagate upstream cookies, redirects, CORS or cache rules.
    return new Response(upstream.body,{status:upstream.status,headers});
  }catch{return fail(503,'Servicio Studio temporalmente no disponible')}
}
