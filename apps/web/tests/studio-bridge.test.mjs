import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/studio/[[path]].js';
const origin='https://bnergiv.com';
const auth='Bearer fake.header.signature';
test('Studio bridge read-only and fail closed',async()=>{
 let calls=[];
 const env={ADMIN_SESSION_API:{fetch:async req=>{calls.push(req);return Response.json({user:{id:'staff-1',role:'operator'}})}},STUDIO_API:{fetch:async req=>{calls.push(req);return Response.json({error:'Studio aún no habilitado'},{status:503,headers:{'Set-Cookie':'bad=1','Cache-Control':'public'}})}}};
 const call=(path='/api/studio/v1/me',opts={})=>onRequest({request:new Request((opts.origin||origin)+path,{method:opts.method||'GET',headers:{...(opts.auth===false?{}:{Authorization:auth}),...(opts.headers||{})}}),env:opts.env??env});
 assert.equal((await call(undefined,{auth:false})).status,401);assert.equal(calls.length,0);
 assert.equal((await call(undefined,{method:'POST'})).status,405);
 assert.equal((await call(undefined,{origin:'https://preview.example'})).status,403);
 assert.equal((await call(undefined,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await call('/api/studio/v1/devices')).status,404);
 assert.equal((await call(undefined,{env:{}})).status,503);
 assert.equal(calls.length,0);
 let res=await call('/api/studio/v1/catalog?search=panel',{headers:{Cookie:'private=secret'}});
 assert.equal(res.status,503);assert.equal(res.headers.get('set-cookie'),null);assert.equal(res.headers.get('cache-control'),'private, no-store');
 assert.equal(calls.length,2);assert.equal(new URL(calls[1].url).pathname,'/v1/catalog');assert.equal(calls[1].headers.get('Cookie'),null);assert.equal(calls[1].headers.get('Authorization'),auth);assert.equal(calls[1].redirect,'manual');
 env.ADMIN_SESSION_API.fetch=async()=>new Response(null,{status:401});assert.equal((await call()).status,401);assert.equal(calls.length,2);
 env.ADMIN_SESSION_API.fetch=async()=>Response.json({user:{role:'customer'}});assert.equal((await call()).status,403);
 env.ADMIN_SESSION_API.fetch=async()=>Response.json({user:{role:'admin'}});env.STUDIO_API.fetch=async()=>Response.redirect('https://evil.invalid');assert.equal((await call()).status,502);
});

test('native activation bridge: existing staff only, no cookies or refresh token, gate closed, limited routes',async()=>{
 const calls=[];
 let enabled=false,allowed=true,centralRole='operator';
 const env={ADMIN_SESSION_API:{fetch:async req=>{
   calls.push({service:'central',req});
   const p=new URL(req.url).pathname;
   if(p.endsWith('/login'))return Response.json({access_token:'fake.header.signature',refresh_token:'never-forward',user:{id:'staff-1',email:'staff@invalid.test',role:centralRole}});
   if(p.endsWith('/logout'))return Response.json({ok:true});
   return Response.json({user:{id:'staff-1',role:centralRole}});
 }},STUDIO_API:{fetch:async req=>{
   calls.push({service:'studio',req});
   const p=new URL(req.url).pathname;
   if(!enabled)return Response.json({error:'disabled'},{status:503});
   if(p==='/v1/me')return req.headers.get('Authorization')===auth&&allowed?Response.json({user:{id:'staff-1',email:'staff@invalid.test',role:'worker'}}):Response.json({error:'denied'},{status:403});
   return Response.json({ok:true});
 }}};
 const call=(p,method='GET',data,extra={})=>onRequest({request:new Request(origin+'/api/studio/native'+p,{method,headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.5',...(p==='/login'?{}:{Authorization:auth}),...extra},body:data===undefined?undefined:JSON.stringify(data)}),env});
 const credentials={email:'staff@invalid.test',password:'not-a-real-password'};
 assert.equal((await call('/login','POST',credentials)).status,503);assert.equal(calls.filter(c=>c.service==='central').length,0);
 enabled=true;
 assert.equal((await call('/login','POST',credentials,{Origin:origin})).status,403);
 assert.equal((await call('/login','POST',credentials,{Cookie:'secret=x'})).status,403);
 let res=await call('/login','POST',credentials);assert.equal(res.status,200);
 const result=await res.json();assert.equal(result.access_token,'fake.header.signature');assert.equal(result.refresh_token,undefined);assert.equal(result.user.role,'worker');
 const centralLogin=calls.find(c=>new URL(c.req.url).pathname.endsWith('/login'));assert.equal(centralLogin.req.headers.get('CF-Connecting-IP'),'192.0.2.5');assert.deepEqual(await centralLogin.req.json(),credentials);
 allowed=false;assert.equal((await call('/login','POST',credentials)).status,403);assert.ok(new URL(calls.at(-1).req.url).pathname.endsWith('/logout'));
 allowed=true;centralRole='customer';assert.equal((await call('/login','POST',credentials)).status,403);assert.ok(new URL(calls.at(-1).req.url).pathname.endsWith('/logout'));centralRole='operator';
 assert.equal((await call('/v1/activation/challenge','POST',{deviceId:'pc'})).status,200);
 assert.equal((await call('/v1/devices/pc/projects/p/changes?after=2')).status,200);
 assert.equal((await call('/v1/projects/p/sections/task-1','PUT',{})).status,404);
 assert.equal((await call('/v1/admin/members/a/devices/pc','DELETE')).status,404);
 assert.equal((await call('/logout','POST',{})).status,200);
});

test('enterprise bridge confines backups and conflict reviews to central admin',async()=>{
 const seen=[];let role='operator';
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'a',role}})},STUDIO_API:{fetch:async req=>{seen.push(req);return Response.json({ok:true})}}};
 const call=(path,method='GET',body)=>onRequest({request:new Request(origin+'/api/studio'+path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env});
 assert.equal((await call('/v1/admin/conflicts')).status,403);
 assert.equal((await call('/v1/admin/projects/p/backups/b','POST',{})).status,403);
 role='admin';
 assert.equal((await call('/v1/admin/conflicts')).status,200);
 assert.equal((await call('/v1/admin/projects/p/backups/b','POST',{})).status,200);
 assert.equal(seen.at(-1).method,'POST');
 assert.equal((await call('/v1/admin/projects/p/backups/b/preview')).status,200);
 assert.equal((await call('/v1/admin/conflicts/1/resolve','POST',{choice:'remote'})).status,200);
 assert.equal((await call('/v1/projects/p/sections/task-1','PUT',{})).status,405);
});

test('project and member administration uses exact allowed methods and role',async()=>{
 let role='operator';const seen=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'a',role}})},STUDIO_API:{fetch:async req=>{seen.push(req);return Response.json({ok:true})}}};
 const call=(path,method='GET',body)=>onRequest({request:new Request(origin+'/api/studio'+path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env});
 assert.equal((await call('/v1/projects','POST',{id:'p',name:'Proyecto'})).status,403);
 role='admin';
 assert.equal((await call('/v1/projects','POST',{id:'p',name:'Proyecto'})).status,200);
 assert.equal((await call('/v1/admin/members')).status,200);
 assert.equal((await call('/v1/admin/members/a','PUT',{role:'worker',active:true})).status,200);
 assert.equal((await call('/v1/projects/p/assignments')).status,200);
 assert.equal((await call('/v1/projects/p/assignments/a','PUT',{})).status,200);
 assert.equal((await call('/v1/projects/p/assignments/a','DELETE')).status,200);
 assert.equal((await call('/v1/projects/p/sections/budget','PUT',{})).status,405);
});

test('internal publication suggestions never publish directly and review requires central admin',async()=>{
 let role='operator';const seen=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'staff',role}})},
 STUDIO_API:{fetch:async req=>{seen.push(req);return Response.json({automaticPublishing:false})}}};
 const call=(route,method='GET',data)=>onRequest({request:new Request(origin+'/api/studio'+route,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env});
 assert.equal((await call('/v1/publication-proposals')).status,200);
 assert.equal((await call('/v1/publication-proposals','POST',{kind:'catalog'})).status,200);
 assert.equal(seen.at(-1).method,'POST');
 assert.equal((await call('/v1/admin/publication-proposals/abc/decision','POST',{decision:'accept'})).status,403);
 role='admin';
 assert.equal((await call('/v1/admin/publication-proposals/abc/decision','POST',{decision:'reject'})).status,200);
 assert.equal((await call('/v1/publication-proposals/abc','DELETE')).status,405);
 assert.equal((await call('/v1/products','POST',{})).status,405);
});
