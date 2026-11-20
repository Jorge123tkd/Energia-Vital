const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {pathToFileURL}=require('node:url');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/admin-navigation.ts'),'utf8');
const nav={exports:{}};
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(nav,nav.exports);
const {adminPaths,adminTabForPath,isAdminPath}=nav.exports;
for(const [tab,url] of Object.entries(adminPaths)){
 assert.ok(isAdminPath(url));assert.equal(adminTabForPath(url),tab);assert.equal(adminTabForPath(url+'/'),tab);
}
assert.equal(adminTabForPath('/admin'),'requests');
assert.equal(adminTabForPath('/admin/invalid'),'requests');
assert.equal(adminTabForPath('/admin/citas','operator'),'appointments');
assert.equal(adminTabForPath('/admin/personal','operator'),'requests');
assert.equal(isAdminPath('/administracion'),false);
console.log('PASS admin navigation: deep links, reload, canonical fallback, operator restrictions');
(async()=>{
 const {onRequest}=await import(pathToFileURL(path.join(__dirname,'../functions/api/admin-session/[action].js')).href);
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const jwt=(sid,kind)=>encode({alg:'HS256'})+'.'+encode({sid,kind,type:'admin',exp:Math.floor(Date.now()/1000)+86400})+'.sig';
 const refreshA=jwt('session-a','refresh'),accessA=jwt('session-a','access');
 const refreshB=jwt('session-b','refresh'),accessB=jwt('session-b','access');
 const origin='https://bnergiv.com';
 const calls=[];
 let upstreamResult={access_token:accessA,refresh_token:refreshA,user:{id:'admin-a',role:'admin'}};
 let status=200;
 const env={ADMIN_SESSION_API:{fetch:async(url,options)=>{
   assert.equal(options.redirect,'manual','Workers does not implement redirect:error');
   calls.push({url,body:JSON.parse(options.body),headers:new Headers(options.headers)});
   return Response.json(url.endsWith('/logout')?{message:'Sesión cerrada'}:upstreamResult,{status});
 }}};
 const request=async(action,body={},options={})=>{
   const host=options.host||origin;
   const headers={'Content-Type':'application/json',Origin:options.origin||host,'Sec-Fetch-Site':options.site||'same-origin','CF-Connecting-IP':'192.0.2.5'};
   if(options.cookie)headers.Cookie=options.cookie;
   return onRequest({request:new Request(host+'/api/admin-session/'+action,{method:'POST',headers,body:JSON.stringify(body)}),params:{action},env:options.env||env});
 };
 let res=await request('login',{email:'test@invalid.example',password:'fake-test-password',remember:true},{origin:'https://evil.invalid'});
 assert.equal(res.status,403);assert.equal(calls.length,0);
 res=await request('login',{}, {host:'https://qa-example.pages.dev'});assert.equal(res.status,403);assert.equal(calls.length,0);
 res=await request('login',{}, {site:'cross-site'});assert.equal(res.status,403);assert.equal(calls.length,0);
 res=await request('refresh',{}, {env:{}});assert.equal(res.status,503);
 res=await request('refresh');assert.equal(res.status,401);assert.equal(calls.length,0);
 res=await request('login',{email:'test@invalid.example',password:'fake-test-password',remember:true});
 assert.equal(res.status,200);const result=await res.json();
 assert.equal(result.access_token,accessA);assert.ok(!('refresh_token'in result));assert.equal(res.headers.get('Cache-Control'),'private, no-store');
 const cookies=res.headers.getSetCookie();
 assert.ok(cookies.some(x=>x.startsWith('__Host-bonaire_admin_remembered='+refreshA)&&x.includes('HttpOnly')&&x.includes('Secure')&&x.includes('SameSite=Strict')&&x.includes('Path=/')&&x.includes('Max-Age=604800')&&!x.includes('Domain=')));
 assert.equal(calls[0].body.browser_session,true);assert.equal(calls[0].body.remember,true);assert.equal(calls[0].headers.get('CF-Connecting-IP'),'192.0.2.5');
 const cookie='__Host-bonaire_admin_remembered='+refreshA;
 res=await request('refresh',{sid:'another-session'},{cookie});assert.equal(res.status,401);assert.equal(calls.length,1);
 res=await request('refresh',{sid:'session-a'},{cookie});assert.equal(res.status,200);assert.equal(calls[1].body.refresh_token,refreshA);assert.ok(!('refresh_token'in await res.json()));
 status=503;res=await request('refresh',{sid:'session-a'},{cookie});assert.equal(res.status,503);assert.equal(res.headers.getSetCookie().length,0);
 status=200;
 res=await request('login',{email:'new@invalid.example',password:'another-fake-password',remember:false},{cookie});
 assert.equal(res.status,200);
 assert.ok(res.headers.getSetCookie().some(x=>x.startsWith('__Host-bonaire_admin='+refreshA)&&!x.includes('Max-Age')));
 assert.ok(calls.at(-1).url.endsWith('/logout'));
 upstreamResult={access_token:accessB,refresh_token:refreshB};
 res=await request('refresh',{sid:'session-a'},{cookie});assert.equal(res.status,502);
 res=await request('logout',{sid:'session-a'},{cookie});assert.equal(res.status,200);assert.ok(res.headers.getSetCookie().every(x=>x.includes('Max-Age=0')));
 assert.ok(calls.at(-1).url.endsWith('/logout'));assert.equal(calls.at(-1).body.refresh_token,refreshA);
 // A real binding must not follow redirects with a password or refresh token.
 let redirectCalls=0;
 const redirectEnv={ADMIN_SESSION_API:{fetch:async(url,options)=>{
   redirectCalls++;assert.equal(options.redirect,'manual');
   return new Response(null,{status:302,headers:{Location:'https://evil.invalid/collect'}});
 }}};
 res=await request('login',{email:'test@invalid.example',password:'fake-test-password'},{env:redirectEnv});
 assert.equal(res.status,502);assert.equal(redirectCalls,1);assert.equal(res.headers.getSetCookie().length,0);assert.equal(res.headers.get('Location'),null);
 res=await request('refresh',{sid:'session-a'},{cookie,env:redirectEnv});
 assert.equal(res.status,502);assert.equal(redirectCalls,2);assert.equal(res.headers.getSetCookie().length,0);
 console.log('PASS same-origin admin session bridge: CSRF/QA rejection, private binding, cookies, no refresh exposure, account isolation, logout and blocked redirects');
})().catch(e=>{console.error(e);process.exitCode=1});
