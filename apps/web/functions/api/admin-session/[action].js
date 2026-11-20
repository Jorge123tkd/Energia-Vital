// Shared same-origin session bridge. Keep deployed cookie names for compatibility; one account per browser.
const origins=new Set(['https://bnergiv.com','https://www.bnergiv.com','https://energia-vital-web.pages.dev']);
const api='https://energia-vital-api.astrustrus.workers.dev/api/auth/';
const normal='__Host-bonaire_admin',remembered='__Host-bonaire_admin_remembered';
const cookieOptions='; Path=/; HttpOnly; Secure; SameSite=Strict';
function json(data,status=200,cookies=[]){
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'});
 for(const cookie of cookies)headers.append('Set-Cookie',cookie);
 return new Response(JSON.stringify(data),{status,headers});
}
const expire=name=>name+'='+cookieOptions+'; Max-Age=0';
function readCookie(header,name){
 const matches=(header||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(name.length+1);
 return token.length<=4096&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)?token:null;
}
function identity(jwt,kind='refresh'){
 try{
  const part=jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const p=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
  return typeof p.sid==='string'&&['admin','customer'].includes(p.type)&&p.kind===kind?{sid:p.sid,type:p.type}:null;
 }catch{return null;}
}
function setCookie(token,persist){
 return [(persist?remembered:normal)+'='+token+cookieOptions+(persist?'; Max-Age=604800':''),expire(persist?normal:remembered)];
}
export async function onRequest({request,params,env}){
 const origin=new URL(request.url).origin;
 if(!origins.has(origin)||request.method!=='POST'||request.headers.get('Origin')!==origin||
    (request.headers.get('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))
   return json({error:'Solicitud no autorizada'},403);
 if(!env?.ADMIN_SESSION_API)return json({error:'Servicio de sesión no configurado'},503);
 // The private Pages service binding forwards only the actual Cloudflare client IP.
 const upstreamHeaders=new Headers({'Content-Type':'application/json'});
 const ip=request.headers.get('CF-Connecting-IP');
 if(ip)upstreamHeaders.set('CF-Connecting-IP',ip);
 // Workers supports manual/follow only. Never follow redirects carrying credentials.
 const call=async(route,body)=>{
  const upstream=await env.ADMIN_SESSION_API.fetch(api+route,{method:'POST',headers:upstreamHeaders,body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(upstream.status>=300&&upstream.status<400){
   console.warn('ADMIN_SESSION_UPSTREAM_REDIRECT',route,upstream.status);
   return json({error:'Respuesta de autenticación inválida'},502);
  }
  return upstream;
 };
 const action=params.action;
 if(!['login','sign-in','register','refresh','logout'].includes(action))return json({error:'Ruta no disponible'},404);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Formato inválido'},415);
 if(Number(request.headers.get('Content-Length')||0)>8192)return json({error:'Solicitud demasiado grande'},413);
 let body;
 try{
  const reader=request.body?.getReader();if(!reader)return json({error:'Solicitud inválida'},400);
  const decoder=new TextDecoder();let raw='',size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();return json({error:'Solicitud demasiado grande'},413);}raw+=decoder.decode(chunk.value,{stream:true});}
  body=JSON.parse(raw+decoder.decode());
 }
 catch{return json({error:'Solicitud inválida'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Solicitud inválida'},400);
 const cookie=request.headers.get('Cookie');
 const a=readCookie(cookie,normal),b=readCookie(cookie,remembered);
 const current=a&&!b?a:b&&!a?b:null;
 const signingIn=['login','sign-in','register'].includes(action);
 const currentIdentity=current?identity(current):null;
 const scope=body.kind==='customer'?'customer':body.kind==='any'&&action==='refresh'&&!body.sid?'any':'admin';
 if(!signingIn&&current&&(!currentIdentity||(scope!=='any'&&currentIdentity.type!==scope)||(body.sid&&currentIdentity.sid!==body.sid)))
   return json({error:'La sesión pertenece a otra cuenta'},401);
 if(!signingIn&&body.sid&&!current)return json({error:'No hay sesión activa'},401);
 if(action==='refresh'&&!current)return json({error:'No hay sesión activa'},401);
 const persist=action!=='register'&&body.remember===true;
 const payload=signingIn?{email:body.email,password:body.password,browser_session:true,remember:persist,...(action==='register'?{name:body.name,phone:body.phone,address:body.address,city:body.city,province:body.province}:{})}:{refresh_token:current};
 try{
  if(action==='logout'&&!current)return json({message:'Sesión cerrada'},200,[expire(normal),expire(remembered)]);
  const upstream=await call(action,payload);
  if(action==='logout'){
   if(!upstream.ok&&upstream.status!==401)return json({error:'No se pudo confirmar el cierre remoto'},503,[expire(normal),expire(remembered)]);
   return json({message:'Sesión cerrada'},200,[expire(normal),expire(remembered)]);
  }
  if(!upstream.ok){
   let message=upstream.status===401?'Credenciales o sesión inválidas':upstream.status===429?'Demasiados intentos. Intenta más tarde.':'No se pudo comprobar la sesión';
   if(action==='register'&&[400,409].includes(upstream.status)){const detail=await upstream.json().catch(()=>null);if(typeof detail?.error==='string')message=detail.error;}
   return json({error:message},upstream.status);
  }
  const result=await upstream.json();
  const next=identity(result.refresh_token),access=identity(result.access_token,'access');
  if(!next||!access||next.sid!==access.sid||next.type!==access.type||
    (action==='login'&&next.type!=='admin')||(action==='register'&&next.type!=='customer')||
    (action==='refresh'&&(next.sid!==currentIdentity?.sid||next.type!==currentIdentity?.type)))
   return json({error:'Respuesta de autenticación inválida'},502);
  // A successful account switch must revoke the prior browser session.
  if(signingIn&&currentIdentity){
   const revoked=await call('logout',{refresh_token:current});
   if(!revoked.ok&&revoked.status!==401)return json({error:'No se pudo cerrar la sesión anterior. Intenta de nuevo.'},503);
  }
  return json({access_token:result.access_token,...(signingIn?{user:result.user}:{})},200,setCookie(result.refresh_token,signingIn?persist:!!b));
 }catch(e){
  // Never log request bodies, credentials, tokens, URLs or exception messages.
  console.error('ADMIN_SESSION_UPSTREAM_FAILURE',action,e instanceof TypeError?'TypeError':e?.name==='TimeoutError'?'TimeoutError':'Other');
  return json({error:'Servicio de sesión temporalmente no disponible'},503,action==='logout'?[expire(normal),expire(remembered)]:[]);
 }
}
