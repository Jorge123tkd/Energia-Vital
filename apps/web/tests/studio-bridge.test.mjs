import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/studio/[[path]].js';
test('Pages routes include only the supported Studio and session bridges', () => {
 const config=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url),'utf8'));
 assert.equal(config.version,1);
 assert.deepEqual(config.include.sort(),['/api/admin-session/*','/api/studio/*'].sort());
 assert.deepEqual(config.exclude,[]);
});
test('Studio service bindings exist only in Pages production configuration', () => {
 const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
 assert.match(config,/\[\[env\.production\.services\]\]\s*binding\s*=\s*"ADMIN_SESSION_API"\s*service\s*=\s*"energia-vital-api"/);
 assert.match(config,/\[\[env\.production\.services\]\]\s*binding\s*=\s*"STUDIO_API"\s*service\s*=\s*"evpro-sync-api"/);
 assert.doesNotMatch(config,/\[\[env\.preview\.services\]\]/);
});
test('release refuses Pages preview deployment and verifies actual production branch',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('id: pages-production'));
 assert.ok(workflow.includes('/pages/projects/energia-vital-web'));
 assert.ok(workflow.includes('production_branch'));
 assert.ok(workflow.includes('"$branch" != "$GITHUB_REF_NAME"'));
 assert.ok(workflow.includes('--branch "${{ steps.pages-production.outputs.branch }}"'));
 const api=workflow.slice(workflow.indexOf('  deploy-api:'),workflow.indexOf('  deploy-web:'));
 const web=workflow.slice(workflow.indexOf('  deploy-web:'));
 assert.ok(api.includes('id: check-pages-production'),'La validación previa debe estar en deploy-api');
 assert.ok(api.indexOf('id: check-pages-production') < api.indexOf('run: npx wrangler deploy'),'No desplegar Worker antes de comprobar Pages');
 assert.ok(web.includes('id: pages-production'),'Comprobar de nuevo la rama antes de desplegar Pages');
 assert.ok(web.indexOf('id: pages-production') < web.indexOf('run: npx wrangler pages deploy'),'Comprobar Pages antes de publicarlo');
 assert.ok(workflow.includes("github.ref == 'refs/heads/main'"));
});
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
 assert.equal((await call('/v1/projects/p/sections/task-1','PUT',{})).status,200); // Bridge permits typed row; Studio independently validates its payload and gate.
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

test('assigned staff may submit only validated task/material row routes through bridge',async()=>{
 const requests=[];const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'staff',role:'operator'}})},
 STUDIO_API:{fetch:async req=>{requests.push(req);return Response.json({revision:2})}}};
 const call=(path,method='GET',data)=>onRequest({request:new Request(origin+'/api/studio'+path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env});
 assert.equal((await call('/v1/projects/p/sections/task-one','PUT',{baseRevision:1,operationId:'op',data:{title:'One',status:'pending',dueDate:''}})).status,200);
 assert.equal(requests.at(-1).method,'PUT');
 assert.equal((await call('/v1/projects/p/sections/material-one','PUT',{baseRevision:1,operationId:'op'})).status,200);
 assert.equal((await call('/v1/projects/p/sections/budget','PUT',{})).status,405);
 assert.equal((await call('/v1/projects/p/sections/engineering','PUT',{})).status,405);
 assert.equal((await call('/v1/projects/p/sections/task-one','DELETE')).status,405);
 assert.equal((await call('/v1/projects/p/sections/task-one','POST',{})).status,405);
});

test('first administrator bootstrap requires an existing central admin session',async()=>{
 let role='operator';const upstream=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'operator',role}})},
 STUDIO_API:{fetch:async req=>{upstream.push(req);return Response.json({member:{user_id:'operator',role:'admin'}})}}};
 const request=()=>onRequest({request:new Request(origin+'/api/studio/v1/bootstrap/initial-admin',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:'{}'}),env});
 assert.equal((await request()).status,403);assert.equal(upstream.length,0);
 role='admin';assert.equal((await request()).status,200);
 assert.equal(upstream[0].method,'POST');
 assert.equal(new URL(upstream[0].url).pathname,'/v1/bootstrap/initial-admin');
});

test('online engineering gateway only permits admin GET and revisioned PUT on exact workspace route',async()=>{
 let role='operator',forwarded=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'a',role}})},
  STUDIO_API:{fetch:async req=>{
   forwarded.push({path:new URL(req.url).pathname,method:req.method,auth:req.headers.get('Authorization'),cookie:req.headers.get('Cookie'),body:req.method==='PUT'?await req.json():null});
   return Response.json(req.method==='PUT'?{ok:true,rev:'test:1'}:{snapshot:null,rev:''});
  }}};
 const path='/api/studio/v1/engineering/workspace';
 const call=(method='GET',body,headers={},route=path)=>onRequest({request:new Request(origin+route,{method,headers:{Authorization:auth,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env});
 assert.equal((await call()).status,403);assert.equal(forwarded.length,0);
 role='admin';
 assert.equal((await call('GET',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await call('GET',undefined,{},path+'?account=other')).status,404);
 assert.equal((await call('POST',{})).status,405);
 const read=await call();assert.equal(read.status,200);assert.equal(read.headers.get('Cache-Control'),'private, no-store');
 const payload={snapshot:{companies:[],projects:[],library:[],templates:[]},expected:'',rev:'test:1'};
 assert.equal((await call('PUT',payload,{Cookie:'irrelevant=1'})).status,200);
 assert.deepEqual(forwarded.at(-1),{path:'/v1/engineering/workspace',method:'PUT',auth,cookie:null,body:payload});
});
test('original engineering frame does not expose session credentials or use same-origin sandbox',()=>{
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 assert.match(frame,/new MessageChannel/);assert.doesNotMatch(frame,/allow-same-origin/);
 assert.match(frame,/sessionStorage\.getItem\(ADMIN_TOKEN_KEY\)!==token/);
 assert.match(bridge,/event\.source!==parent/);assert.match(bridge,/event\.origin!==expectedParentOrigin/);
 assert.doesNotMatch(bridge,/Authorization:|sessionStorage\.getItem\(/);
});

test('native Windows engineering uses identical workspace API without exposing session cookies',async()=>{
 let role='operator',seen=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'a',role}})},
 STUDIO_API:{fetch:async req=>{seen.push({method:req.method,path:new URL(req.url).pathname,cookie:req.headers.get('Cookie'),auth:req.headers.get('Authorization')});return Response.json({snapshot:null,rev:''})}}};
 const path='/api/studio/native/v1/engineering/workspace';
 const call=(method='GET',body,headers={})=>onRequest({request:new Request(origin+path,{method,headers:{Authorization:auth,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env});
 assert.equal((await call()).status,403);assert.equal(seen.length,0);
 role='admin';
 assert.equal((await call('GET',undefined,{Origin:origin})).status,403);
 assert.equal((await call('GET',undefined,{Cookie:'x=y'})).status,403);
 assert.equal((await call()).status,200);
 assert.equal((await call('PUT',{snapshot:{companies:[],projects:[],library:[],templates:[]},expected:'',rev:'test-1'})).status,200);
 assert.deepEqual(seen.map(x=>x.path),['/v1/engineering/workspace','/v1/engineering/workspace']);
 assert.ok(seen.every(x=>x.cookie===null&&x.auth===auth));
 assert.equal((await call('DELETE')).status,404);
});

test('engineering attachment routes are exact, private and administrator-only for browser and native clients',async()=>{
 let role='operator',seen=[];
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'a',role}})},
  STUDIO_API:{fetch:async req=>{seen.push({path:new URL(req.url).pathname,method:req.method,body:req.method==='GET'?null:await req.json()});return Response.json({ok:true})}}};
 const hash='a'.repeat(64),payload={data:'data:application/pdf;base64,SGVsbG8='};
 const call=(prefix,path,method='GET',body)=>onRequest({request:new Request(origin+prefix+path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env});
 for(const prefix of ['/api/studio','/api/studio/native']){
  assert.equal((await call(prefix,'/v1/engineering/manifest')).status,403);
  assert.equal((await call(prefix,'/v1/engineering/assets/'+hash,'PUT',payload)).status,403);
 }
 assert.equal(seen.length,0);role='admin';
 for(const prefix of ['/api/studio','/api/studio/native']){
  assert.equal((await call(prefix,'/v1/engineering/manifest')).status,200);
  assert.equal((await call(prefix,'/v1/engineering/assets/check','POST',{hashes:[hash]})).status,200);
  assert.equal((await call(prefix,'/v1/engineering/assets/'+hash,'PUT',payload)).status,200);
  assert.deepEqual(seen.at(-1).body,payload);
  assert.ok([404,405].includes((await call(prefix,'/v1/engineering/assets/not-a-hash')).status));
  assert.ok([404,405].includes((await call(prefix,'/v1/engineering/assets/'+hash,'DELETE')).status));
 }
});

test('web engineering uses an explicit module export and full viewport isolated dialog',async()=>{
 const {transport}=await import('../src/lib/engineering-assets.js');
 const calls=[];
 const sync=transport(async(method,path)=>{calls.push([method,path]);return {snapshot:null,rev:''}});
 assert.deepEqual(await sync('GET'),{snapshot:null,rev:''});
 assert.deepEqual(calls,[['GET','/manifest']]);
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 assert.match(frame,/import \{transport\} from/);
 assert.match(frame,/position:fixed;inset:0/);
 assert.match(frame,/height:100dvh/);
 assert.match(frame,/event\.source!==frame\.contentWindow/);
 assert.match(frame,/event\.origin!=='null'/);
 assert.match(frame,/evpro-engineering-ready-v2/);
 assert.match(bridge,/evpro-engineering-ready-v2/);
 assert.match(bridge,/check-close/);
 assert.doesNotMatch(frame,/EVEngineeringAssets/);
});

test('Studio route is a dedicated app, not a nested commercial admin page',()=>{
 const admin=readFileSync(new URL('../src/AdminPage.svelte',import.meta.url),'utf8');
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const entry=readFileSync(new URL('../src/components/StudioEntrance.svelte',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 assert.match(admin,/\{#if token && ownId && tab === 'studio' && studioUiEnabled\}[\s\S]*?<StudioEntrance[\s\S]*?\{:else\}[\s\S]*?<header class="sticky/);
 assert.doesNotMatch(frame,/Abrir EV Pro Online|showModal\(/);
 assert.match(frame,/\{@render business\(section\)\}/);
 const menu=readFileSync(new URL('../public/studio-engineering/business-menu.js',import.meta.url),'utf8');
 assert.match(menu,/OPERACIONES BONAIRE/);assert.match(bridge,/EVBusinessMenu/);
 assert.match(bridge,/studio-navigation/);
 assert.match(entry,/StudioOperations[\s\S]*initialMode=/);
});

test('online Studio groups overlapping functions without a second project creation flow',()=>{
 const bridge=readFileSync(new URL('../public/studio-engineering/business-menu.js',import.meta.url),'utf8');
 const entry=readFileSync(new URL('../src/components/StudioEntrance.svelte',import.meta.url),'utf8');
 const management=readFileSync(new URL('../src/components/StudioManagement.svelte',import.meta.url),'utf8');
 assert.doesNotMatch(bridge,/\['assigned',|\['orders',|\['suppliers',|\['shortages',|\['conflicts',/);
 assert.match(bridge,/'Colaboración y permisos','projects'/);
 assert.match(bridge,/'Catálogo comercial','library'/);
 assert.match(bridge,/'Copias de secciones compartidas','backups'/);
 assert.match(bridge,/'Almacén y compras'/);
 assert.match(entry,/procurementGroup=\{section==='inventory'\}/);
 assert.match(entry,/section!=='catalog'/);
 assert.doesNotMatch(management,/Crear proyecto|function create\(/);
});

test('Studio account actions use the real authenticated parent session and guard unsaved work',()=>{
 const admin=readFileSync(new URL('../src/AdminPage.svelte',import.meta.url),'utf8');
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 assert.match(admin,/onLogout=\{logout\}/);
 assert.match(frame,/data\.action==='account'/);assert.match(frame,/email:account\.email/);
 assert.match(frame,/if\(action==='logout'\)void onLogout\(\)/);
 assert.match(bridge,/!engineeringCanLeave\(\)/);
 assert.match(bridge,/section:'logout'/);
});

test('authenticated account is supplied to the top bar independently of the renderer RPC; back remains separate',()=>{
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/studio-engineering/index.html',import.meta.url),'utf8');
 assert.match(frame,/evpro-engineering-connect-v1',account:\{email:account.email,role:account.role\}/);
 assert.match(bridge,/verifiedAccount=Object.freeze\(\{email:identity.email,role:identity.role/);
 assert.match(bridge,/document.getElementById\('top'\)/);
 assert.match(bridge,/email.textContent=verifiedAccount.email/);
 assert.match(bridge,/logout.textContent='Cerrar sesión'/);
 assert.match(bridge,/\.session-tools:not\(#ev-web-account-fallback\) \.logout-btn/);
 assert.match(bridge,/section:'logout'/);
 assert.match(readFileSync(new URL('../public/studio-engineering/business-menu.js',import.meta.url),'utf8'),/\['exit','←','Volver a Bonaire'\]/);
 assert.match(frame,/requestClose\(data.section\)/);
 assert.match(frame,/if\(data.pending===false\)\{finishClose\(\);return\}/);
 assert.match(frame,/index\.html\?v=studio-3.9.0-beta.12/);
 assert.match(html,/bridge\.js\?v=studio-3.9.0-beta.12/);
 assert.match(html,/app\.js\?v=studio-3.9.0-beta.12/);
});

test('web account fallback renders once from trusted parent and sends logout, not back',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/studio-engineering/bridge.js',import.meta.url),'utf8');
 let receiver,refreshTop,native=false;
 const sent=[];
 class Node {
  constructor(){this.children=[];this.events={};this.id='';this.className='';this.textContent=''}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  setAttribute(){}
  addEventListener(type,cb){this.events[type]=cb}
  querySelector(selector){
   if(selector==='#ev-web-account-fallback')return this.children.find(x=>x.id==='ev-web-account-fallback')||null;
   if(selector.includes('.session-tools:not'))return native?{}:null;
   return null;
  }
 }
 const top=new Node(),parent={postMessage(){}},window={addEventListener(_type,cb){receiver=cb},removeEventListener(){}};
 const port={postMessage(value){sent.push(value)},start(){}};
 runInNewContext(source,{window,parent,location:{href:'https://bnergiv.com/studio-engineering/index.html'},URL,
  document:{getElementById(id){return id==='top'?top:null},createElement(){return new Node()}},
  MutationObserver:class{constructor(cb){refreshTop=cb}observe(){}},
  setInterval(){return 1},clearInterval(){},setTimeout,clearTimeout});
 const data={type:'evpro-engineering-connect-v1',account:{email:'qa@example.invalid',role:'admin'}};
 receiver({source:parent,origin:'https://untrusted.invalid',data,ports:[port]});
 assert.equal(top.children.length,0);
 receiver({source:parent,origin:'https://bnergiv.com',data,ports:[port]});
 assert.equal(top.children.length,1);
 const group=top.children[0];
 assert.equal(group.children[0].children[1].textContent,'qa@example.invalid');
 assert.equal(group.children[1].textContent,'Cerrar sesión');
 group.children[1].events.click();
 assert.equal(sent[0].type,'studio-navigation');assert.equal(sent[0].section,'logout');
 refreshTop();assert.equal(top.children.length,1);
 native=true;refreshTop();assert.equal(top.children.length,0,'No duplicar los controles del núcleo compartido');
 native=false;refreshTop();assert.equal(top.children.length,1,'Recuperar controles tras redibujar la cabecera');
});

test('web transport uses the expanded attachment capacity and batches checks',async()=>{
 const {transport}=await import('../src/lib/engineering-assets.js');
 const data='data:image/png;base64,'+Buffer.alloc(11*1024*1024,67).toString('base64');
 const snapshot={companies:[],projects:[{images:Array.from({length:4},()=>({data}))},{images:Array.from({length:70},(_,i)=>({data:'data:image/png;base64,'+Buffer.from('image-'+i).toString('base64')}))}],library:[],templates:[]};
 const batches=[];const sync=transport(async(method,path,payload)=>{
  if(path==='/assets/check'){batches.push(payload.hashes.length);return {present:payload.hashes}}
  if(path==='/manifest'&&method==='PUT')return {ok:true,rev:payload.rev};
  throw Error('unexpected '+path);
 });
 assert.equal((await sync('PUT',{snapshot,expected:'',rev:'qa-large'})).ok,true);
 assert.deepEqual(batches,[32,32,7]);
});

test('web uses same explicit confirmation for large backup downloads and restores',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../public/studio-engineering/app.js',import.meta.url),'utf8');
 const begin=source.indexOf('const recommendedBackupBytes='),end=source.indexOf('function backupProject(',begin);
 let answer=false,calls=0;
 const ctx={TextEncoder,confirm:()=>{calls++;return answer}};
 runInNewContext(source.slice(begin,end),ctx);
 assert.equal(ctx.confirmLargeBackup(40*1024*1024,'importar'),true);
 assert.equal(calls,0);
 assert.equal(ctx.confirmLargeBackup(48*1024*1024,'importar'),false);
 answer=true;
 assert.equal(ctx.confirmLargeBackup(48*1024*1024,'importar'),true);
 assert.equal(calls,2);
 assert.ok(source.includes("if(!approveImportedWorkspace(next))return false;state=next;"));
});

test('desktop operations reuse exactly the authenticated web modules and managed version',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const app=read('src/App.svelte'),entry=read('src/components/StudioEntrance.svelte'),desktop=read('src/components/StudioDesktopOperations.svelte'),api=read('src/lib/api.ts');
 assert.match(app,/currentRoute === '\/studio-desktop-operations'/);
 assert.match(desktop,/<StudioEntrance token="desktop-session" desktopSection=/);
 assert.match(entry,/\{@render business\(desktopSection\)\}/);
 assert.match(api,/desktop\.request\(path,options\.method/);
 assert.match(read('src/components/StudioTechnicalShare.svelte'),/!isDesktopStudio\(\)/);
 const manifest=JSON.parse(read('public/studio-engineering/source-version.json'));
 assert.ok(read('src/lib/studio-release.ts').includes(manifest.release));
 assert.match(read('src/components/StudioEngineeringFrame.svelte'),/version:STUDIO_RELEASE/);
});

test('revision polling reads manifest without fetching attachments, and browser forms remain isolated',async()=>{
 const {transport}=await import('../src/lib/engineering-assets.js');
 const calls=[];const sync=transport(async(method,path)=>{calls.push([method,path]);return {rev:'rev-1',snapshot:{projects:[{data:{__evAsset:'a'.repeat(64)}}]}}});
 assert.deepEqual(await sync('REV'),{rev:'rev-1'});assert.deepEqual(calls,[['GET','/manifest']]);
 const frame=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
 const html=readFileSync(new URL('../public/studio-engineering/index.html',import.meta.url),'utf8');
 assert.match(frame,/sandbox="[^"]*allow-forms/);assert.doesNotMatch(frame,/allow-same-origin/);assert.match(html,/form-action 'none'/);
 assert.match(frame,/data\.action==='revision'\?'REV'/);
 const app=readFileSync(new URL('../public/studio-engineering/app.js',import.meta.url),'utf8');assert.match(app,/MANAGED_SYNC_INTERVAL=15000/);
});

test('all Studio application routes are passed to their authenticated upstream with exact methods',async()=>{
 const calls=[];let role='admin';
 const env={ADMIN_SESSION_API:{fetch:async()=>Response.json({user:{id:'qa-admin',role}})},STUDIO_API:{fetch:async req=>{calls.push({path:new URL(req.url).pathname,method:req.method,auth:req.headers.get('Authorization')});return Response.json({ok:true})}}};
 const hash='a'.repeat(64);
 const routes=[
 ['GET','/v1/me'],['GET','/v1/catalog?page=1&search=panel'],['GET','/v1/projects?after=example'],['POST','/v1/projects',{id:'p',name:'QA'}],
 ['GET','/v1/projects/p/sections'],['GET','/v1/projects/p/sections/task-a'],['PUT','/v1/projects/p/sections/task-a',{}],['PUT','/v1/projects/p/sections/material-a',{}],
 ['GET','/v1/admin/members'],['PUT','/v1/admin/members/a',{}],['GET','/v1/projects/p/assignments'],['PUT','/v1/projects/p/assignments/a',{}],['DELETE','/v1/projects/p/assignments/a'],
 ['GET','/v1/admin/conflicts'],['POST','/v1/admin/conflicts/1/resolve',{}],['GET','/v1/admin/projects/p/backups/b/preview'],['POST','/v1/admin/projects/p/backups/b',{}],
 ['GET','/v1/publication-proposals?project=p'],['POST','/v1/publication-proposals',{}],['POST','/v1/admin/publication-proposals/p/decision',{}],
 ['GET','/v1/engineering/manifest'],['PUT','/v1/engineering/manifest',{}],['POST','/v1/engineering/assets/check',{hashes:[hash]}],['GET','/v1/engineering/assets/'+hash],['PUT','/v1/engineering/assets/'+hash,{data:'data:image/png;base64,QQ=='}]];
 for(const [method,path,body] of routes){
  const prefixes=path.startsWith('/v1/engineering/')?['/api/studio','/api/studio/native']:['/api/studio'];
  for(const prefix of prefixes){
   const r=await onRequest({request:new Request(origin+prefix+path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env});
   assert.equal(r.status,200,method+' '+prefix+path);
   assert.deepEqual(calls.at(-1),{path:path.split('?')[0],method,auth});
  }
 }
});
test('web attachment cache reuses verified bytes across successive revisions',async()=>{
 const {transport,createCache,pack}=await import('../src/lib/engineering-assets.js');
 const snapshot={companies:[],projects:[{data:'data:image/png;base64,SGVsbG8='}],library:[],templates:[]};
 const packed=await pack(snapshot),hash=[...packed.assets.keys()][0];let downloads=0,rev='one';
 const request=async(method,path)=>{
  if(path==='/manifest')return {snapshot:packed.snapshot,rev};
  if(path==='/assets/'+hash){downloads++;return {data:packed.assets.get(hash)}}
  throw Error('Unexpected '+path);
 };
 const cache=createCache();
 assert.deepEqual((await transport(request,{cache})('GET')).snapshot,snapshot);rev='two';
 assert.deepEqual((await transport(request,{cache})('GET')).snapshot,snapshot);assert.equal(downloads,1);
});

test('business modules distinguish saved engineering and linked project records and isolate catalog failures',()=>{
 const entry=readFileSync(new URL('../src/components/StudioEntrance.svelte',import.meta.url),'utf8');
 assert.match(entry,/engineeringProjects\.filter\(p=>!projects\.some\(r=>r\.id===p\.id\)\)/);
 assert.match(entry,/id:original\.id,name:original\.name/);
 assert.match(entry,/await Promise\.all\(jobs\)/);
 assert.match(entry,/catalogError/);
 assert.match(entry,/onBusinessOpen=\{refreshBusiness\}/);
 assert.match(entry,/Vincular expediente/);
 assert.match(entry,/teamTab==='staff'/);
});

 test('business modules register existing IDs and use scoped central write paths',()=>{
 const read=p=>readFileSync(new URL('../src/components/'+p,import.meta.url),'utf8');
 const a=read('StudioCommercialActions.svelte'),e=read('StudioEntrance.svelte'),o=read('StudioOperations.svelte'),m=read('StudioManagement.svelte'),p=read('StudioPublication.svelte'),r=read('StudioProjectReader.svelte');
 assert.match(e,/async function registerAll/);assert.match(e,/id:p\.id,name:p\.name/);
 assert.match(o,/<StudioCommercialActions /);assert.match(a,/method:'POST'/);assert.match(a,/window\.confirm/);assert.match(a,/pending\.fingerprint!==fingerprint/);assert.match(a,/\$state\.snapshot\(pending!/);
 for(const path of ['/movements','/procurement/orders','/procurement/receipts','/obligations','/supplier-payments'])assert.ok(a.includes(path),path);
 assert.match(m,/present!==add/);assert.match(p,/productId===null/);assert.match(r,/function pickProduct/);
 assert.doesNotMatch(a,/localStorage\.|sessionStorage\./);
 });
