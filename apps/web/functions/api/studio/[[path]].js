// Read-only initial bridge. Production binding is never available to preview environments.
// Authentication is rechecked using the existing staff session; Studio independently checks membership.
const allowedHosts = new Set(['https://bnergiv.com','https://www.bnergiv.com','https://energia-vital-web.pages.dev']);
const safeId='[A-Za-z0-9_-]{1,100}';
const permitted = new RegExp('^/v1/(?:me|catalog(?:/'+safeId+')?|projects(?:/'+safeId+'/sections(?:/'+safeId+')?)?)$');
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const fail=(status,error)=>new Response(JSON.stringify({error}),{status,headers});
export async function onRequest({request,env}){
  const url=new URL(request.url);
  if(!allowedHosts.has(url.origin))return fail(403,'Origen no autorizado');
  if(request.method!=='GET')return fail(405,'Método no habilitado');
  const site=request.headers.get('Sec-Fetch-Site');
  if(site&&site!=='same-origin'&&site!=='none')return fail(403,'Origen no autorizado');
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return fail(403,'Origen no autorizado');
  const path=url.pathname.slice('/api/studio'.length);
  if(!url.pathname.startsWith('/api/studio/')||!permitted.test(path)||url.search.length>1024)return fail(404,'Ruta no disponible');
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)||authorization.length>4103)return fail(401,'Debes iniciar sesión');
  if(!env?.STUDIO_API||!env?.ADMIN_SESSION_API)return fail(503,'Servicio Studio no configurado');
  try{
    const auth=await env.ADMIN_SESSION_API.fetch(new Request('https://bonaire.internal/api/auth/admin/me',{headers:{Authorization:authorization},redirect:'manual'}));
    if(auth.status===401||auth.status===403)return fail(auth.status,'Acceso de personal no autorizado');
    if(!auth.ok)return fail(503,'No se pudo verificar la sesión');
    const staff=(await auth.json()).user;
    if(!staff||!['admin','operator'].includes(staff.role))return fail(403,'Acceso de personal no autorizado');
    const upstream=await env.STUDIO_API.fetch(new Request('https://studio.internal'+path+url.search,{headers:{Authorization:authorization,Accept:'application/json'},redirect:'manual'}));
    if(upstream.status>=300&&upstream.status<400)return fail(502,'Respuesta de Studio inválida');
    if(!upstream.headers.get('content-type')?.includes('application/json'))return fail(502,'Respuesta de Studio inválida');
    // Do not propagate upstream cookies, redirects, CORS or cache rules.
    return new Response(upstream.body,{status:upstream.status,headers});
  }catch{return fail(503,'Servicio Studio temporalmente no disponible')}
}
