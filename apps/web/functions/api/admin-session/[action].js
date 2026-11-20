// Same-origin production session bridge: the refresh JWT never goes to browser JavaScript.
const origins=new Set(['https://bnergiv.com','https://www.bnergiv.com','https://energia-vital-web.pages.dev']);
const api='https://energia-vital-api.astrustrus.workers.dev/api/auth/';
const normal='__Secure-bonaire_admin',remembered='__Secure-bonaire_admin_remembered';
const cookieOptions='; Path=/api/admin-session; HttpOnly; Secure; SameSite=Strict';
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
function sessionId(jwt){
 try{
  const part=jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const p=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'=')));
  return typeof p.sid==='string'&&p.type==='admin'&&p.kind==='refresh'?p.sid:null;
 }catch{return null;}
}
function setCookie(token,persist){
 return [(persist?remembered:normal)+'='+token+cookieOptions+(persist?'; Max-Age=604800':''),expire(persist?normal:remembered)];
}
export async function onRequest({request,params}){
 const origin=new URL(request.url).origin;
 if(!origins.has(origin)||request.method!=='POST'||request.headers.get('Origin')!==origin||
    (request.headers.get('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'))
   return json({error:'Solicitud no autorizada'},403);
 const action=params.action;
 if(!['login','refresh','logout'].includes(action))return json({error:'Ruta no disponible'},404);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Formato inválido'},415);
 if(Number(request.headers.get('Content-Length')||0)>8192)return json({error:'Solicitud demasiado grande'},413);
 let body;
 try{const raw=await request.text();if(raw.length>8192)return json({error:'Solicitud demasiado grande'},413);body=JSON.parse(raw);}
 catch{return json({error:'Solicitud inválida'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Solicitud inválida'},400);
 const cookie=request.headers.get('Cookie');
 const a=readCookie(cookie,normal),b=readCookie(cookie,remembered);
 const current=a&&!b?a:b&&!a?b:null;
 if(action!=='login'&&body.sid&&(!current||sessionId(current)!==body.sid))
   return json({error:'La sesión pertenece a otra cuenta'},401);
 if(action==='refresh'&&!current)return json({error:'No hay sesión activa'},401);
 const payload=action==='login'?{email:body.email,password:body.password,browser_session:true,remember:body.remember===true}:{refresh_token:current};
 try{
  if(action==='logout'&&!current)return json({message:'Sesión cerrada'},200,[expire(normal),expire(remembered)]);
  const upstream=await fetch(api+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(action==='logout'){
   if(!upstream.ok&&upstream.status!==401)return json({error:'No se pudo confirmar el cierre remoto'},503);
   return json({message:'Sesión cerrada'},200,[expire(normal),expire(remembered)]);
  }
  if(!upstream.ok)return json({error:upstream.status===401?'Credenciales o sesión inválidas':upstream.status===429?'Demasiados intentos. Intenta más tarde.':'No se pudo comprobar la sesión'},upstream.status);
  const result=await upstream.json();
  if(typeof result.access_token!=='string'||typeof result.refresh_token!=='string'||!sessionId(result.refresh_token))
   return json({error:'Respuesta de autenticación inválida'},502);
  return json({access_token:result.access_token,...(action==='login'?{user:result.user}:{})},200,setCookie(result.refresh_token,action==='login'?body.remember===true:!!b));
 }catch{return json({error:'Servicio de sesión temporalmente no disponible'},503);}
}
