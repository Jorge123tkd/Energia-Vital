/** Pruebas de navegador simulado sin cuentas ni Cloudflare reales.
 * Ejecutar: node apps/web/tests/auth-session.cjs
 * Usa TypeScript ya instalado para evaluar el cliente sin servidor.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/api.ts'), 'utf8')
  .replace("import.meta.env.VITE_API_URL", "''")
  .replace("import.meta.env.VITE_QA_MODE", "'false'");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function accessToken(exp, nonce, sid, type) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  return encode({alg:'none'}) + '.' + encode({exp, nonce, sid, type}) + '.test';
}
const expired = accessToken(Math.floor(Date.now()/1000) - 60, 'old');
const valid = accessToken(Math.floor(Date.now()/1000) + 3600, 'new');
const adminOld = accessToken(Math.floor(Date.now()/1000) - 60, 'admin-old');
const adminNew = accessToken(Math.floor(Date.now()/1000) + 3600, 'admin-new');

function harness(handler,browser=false) {
  const storage = new Map(),local = new Map();
  const exports = {};
  const requests = [];
  const sessionStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const context = vm.createContext({
    exports, sessionStorage, Headers, FormData,
    ...(browser?{location:{origin:'https://bnergiv.com'},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)}}:{}),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    fetch: async (url, options) => {
      const method = options?.method || 'GET';
      const headers = new Headers(options?.headers);
      const entry = { url, method, authorization: headers.get('Authorization'), body: options?.body };
      requests.push(entry);
      return handler(entry);
    }
  });
  vm.runInContext(javascript, context, { filename:'api-session-test.js' });
  return { api:exports, requests, storage, local };
}
const response = (status, body={}) => ({status, ok:status>=200 && status<300, json:async()=>body});
const refreshCalls = entries => entries.filter(item=>item.url.endsWith('/api/auth/refresh'));

(async () => {
  {
    const {api,requests,storage} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh'))
        return response(200,{access_token:valid,refresh_token:'customer-refresh-new'});
      if (entry.authorization === 'Bearer ' + expired) return response(401,{error:'Sesión expirada'});
      if (entry.authorization === 'Bearer ' + valid) return response(200,{user:{id:'customer-test'}});
      return response(500,{error:'Unexpected request'});
    });
    api.setCustomerToken(expired);
    api.setCustomerRefreshToken('customer-refresh-old');
    const me = await api.apiRequest('/api/auth/me');
    assert.equal(me.user.id,'customer-test');
    assert.equal(api.customerToken(),valid);
    assert.equal(refreshCalls(requests).length,1);
    assert.equal(storage.has('customer-refresh-old'),false,'Refresh must never persist');
    console.log('PASS customer identity restoration renews expired access');
  }
  {
    const {api,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh'))
        return response(200,{access_token:valid,refresh_token:'customer-refresh-new'});
      if (entry.authorization === 'Bearer ' + expired) return response(401,{error:'Expired'});
      if (entry.authorization === 'Bearer ' + valid) return response(200,{ok:true});
      return response(500,{error:'Unexpected request'});
    });
    api.setCustomerToken(expired);
    api.setCustomerRefreshToken('customer-refresh-old');
    const results = await Promise.all([
      api.apiRequest('/api/private/requests'),
      api.apiRequest('/api/private/appointments'),
      api.apiRequest('/api/private/notifications'),
    ]);
    assert.ok(results.every(x=>x.ok));
    assert.equal(refreshCalls(requests).length,1,'Concurrent requests must share one refresh');
    console.log('PASS customer single-flight refresh for parallel requests');
  }
  {
    const {api,requests,storage} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh'))
        return response(200,{access_token:adminNew,refresh_token:'admin-refresh-new'});
      if (entry.authorization === 'Bearer ' + adminOld) return response(401,{error:'Expired'});
      if (entry.authorization === 'Bearer ' + adminNew) return response(200,{user:{role:'admin'}});
      return response(500,{error:'Unexpected request'});
    });
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('admin-refresh-old');
    const results = await Promise.all([
      api.apiRequest('/api/auth/admin/me',{headers:{Authorization:'Bearer '+adminOld}}),
      api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}}),
    ]);
    assert.equal(results[0].user.role,'admin');
    assert.equal(results[1].user.role,'admin');
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),adminNew);
    assert.equal(refreshCalls(requests).length,1);
    const stale = await api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}});
    assert.equal(stale.user.role,'admin','Stale in-flight bearer should adopt rotated access');
    assert.equal(refreshCalls(requests).length,1);
    console.log('PASS admin identity restore and stale concurrent request');
  }
  {
    const otherExpired = accessToken(Math.floor(Date.now()/1000)-60,'other-customer');
    const otherValid = accessToken(Math.floor(Date.now()/1000)+3600,'other-customer-new');
    let completeOld;
    const oldGate = new Promise(resolve => { completeOld = resolve; });
    const {api,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh')) {
        const {refresh_token} = JSON.parse(entry.body);
        return refresh_token === 'customer-refresh-A'
          ? oldGate : response(200,{access_token:otherValid,refresh_token:'customer-refresh-B-new'});
      }
      if (entry.authorization === 'Bearer '+expired ||
          entry.authorization === 'Bearer '+otherExpired)
        return response(401,{error:'Expired'});
      if (entry.authorization === 'Bearer '+otherValid) return response(200,{ok:true});
      return response(500,{error:'Unexpected request'});
    });
    api.setCustomerToken(expired);api.setCustomerRefreshToken('customer-refresh-A');
    const oldRequest = api.apiRequest('/api/private/requests').catch(e=>e);
    for(let i=0;i<80 && refreshCalls(requests).length<1;i++) await Promise.resolve();
    assert.equal(refreshCalls(requests).length,1);
    api.setCustomerToken(null);
    api.setCustomerToken(otherExpired);api.setCustomerRefreshToken('customer-refresh-B');
    const nextRequest = await api.apiRequest('/api/private/appointments');
    assert.ok(nextRequest.ok,'New login must not await stale refresh');
    assert.equal(refreshCalls(requests).length,2,'New login issues its own refresh');
    completeOld(response(200,{access_token:valid,refresh_token:'customer-refresh-A-new'}));
    await oldRequest;
    assert.equal(api.customerToken(),otherValid,'Old completed refresh must not overwrite new user');
    console.log('PASS customer account switch isolates in-flight refresh');
  }
  {
    const otherExpired = accessToken(Math.floor(Date.now()/1000)-60,'other-admin');
    const otherValid = accessToken(Math.floor(Date.now()/1000)+3600,'other-admin-new');
    let completeOld;
    const oldGate = new Promise(resolve => { completeOld = resolve; });
    const {api,storage,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh')) {
        const {refresh_token} = JSON.parse(entry.body);
        return refresh_token === 'admin-refresh-A'
          ? oldGate : response(200,{access_token:otherValid,refresh_token:'admin-refresh-B-new'});
      }
      if (entry.authorization === 'Bearer '+adminOld ||
          entry.authorization === 'Bearer '+otherExpired)
        return response(401,{error:'Expired'});
      if (entry.authorization === 'Bearer '+otherValid) return response(200,{ok:true});
      return response(500,{error:'Unexpected request'});
    });
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('admin-refresh-A');
    const oldRequest = api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}})
      .catch(e=>e);
    for(let i=0;i<80 && refreshCalls(requests).length<1;i++) await Promise.resolve();
    assert.equal(refreshCalls(requests).length,1);
    api.clearAdminSession();
    storage.set(api.ADMIN_TOKEN_KEY,otherExpired);
    api.setAdminRefreshToken('admin-refresh-B');
    const nextRequest = await api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+otherExpired}});
    assert.ok(nextRequest.ok,'New admin must not await prior refresh');
    assert.equal(refreshCalls(requests).length,2);
    completeOld(response(200,{access_token:adminNew,refresh_token:'admin-refresh-A-new'}));
    await oldRequest;
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),otherValid);
    console.log('PASS admin account switch isolates in-flight refresh');
  }
  {
    let releaseOld;
    const delayed = new Promise(resolve => { releaseOld = resolve; });
    const newSession = accessToken(Math.floor(Date.now()/1000)+3600,'new-customer-B');
    const {api,requests} = harness(entry => {
      if (entry.authorization === 'Bearer '+expired) return delayed;
      if (entry.url.endsWith('/api/auth/refresh')) throw Error('Old customer request tried cross-account refresh');
      return response(500,{error:'Unexpected request'});
    });
    api.setCustomerToken(expired);api.setCustomerRefreshToken('refresh-A');
    const pending = api.apiRequest('/api/private/requests').catch(error=>error);
    for(let i=0;i<30 && requests.length===0;i++) await Promise.resolve();
    api.setCustomerToken(null);
    api.setCustomerToken(newSession);api.setCustomerRefreshToken('refresh-B');
    releaseOld(response(401,{error:'Expired A'}));
    const result=await pending;
    assert.equal(result.status,401);
    assert.equal(api.customerToken(),newSession);
    assert.equal(requests.length,1,'Old customer request cannot be replayed under B');
    console.log('PASS stale customer request does not borrow new account credentials');
  }
  {
    let releaseOld;
    const delayed = new Promise(resolve => { releaseOld = resolve; });
    const newSession = accessToken(Math.floor(Date.now()/1000)+3600,'new-admin-B');
    const {api,storage,requests} = harness(entry => {
      if (entry.authorization === 'Bearer '+adminOld) return delayed;
      if (entry.url.endsWith('/api/auth/refresh')) throw Error('Old admin request tried cross-account refresh');
      return response(500,{error:'Unexpected request'});
    });
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('refresh-A');
    const pending = api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}}).catch(error=>error);
    for(let i=0;i<30 && requests.length===0;i++) await Promise.resolve();
    api.clearAdminSession();
    storage.set(api.ADMIN_TOKEN_KEY,newSession);api.setAdminRefreshToken('refresh-B');
    releaseOld(response(401,{error:'Expired A'}));
    const result=await pending;
    assert.equal(result.status,401);
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),newSession);
    assert.equal(requests.length,1,'Old admin request cannot be replayed under B');
    console.log('PASS stale admin request does not borrow new account credentials');
  }
  {
    const {api,requests} = harness(entry => response(403,{error:'Sin permisos'}));
    api.setCustomerToken(expired); api.setCustomerRefreshToken('not-to-use');
    await assert.rejects(()=>api.apiRequest('/api/private/requests'),error=>error.status===403);
    assert.equal(refreshCalls(requests).length,0,'403 must never invoke refresh');
    console.log('PASS no refresh for HTTP 403');
  }
  {
    let resolveRefresh;
    const gate = new Promise(resolve=>{resolveRefresh=resolve});
    const {api,storage} = harness(async entry => {
      if (entry.url.endsWith('/api/auth/refresh')) return gate;
      return response(401,{error:'Expired'});
    });
    api.setCustomerToken(expired);api.setCustomerRefreshToken('customer-refresh-old');
    const pending = api.apiRequest('/api/private/requests').catch(e=>e);
    for(let tick=0;tick<30;tick++) await Promise.resolve();
    api.setCustomerToken(null);
    resolveRefresh(response(200,{access_token:valid,refresh_token:'customer-refresh-new'}));
    await pending;
    assert.equal(api.customerToken(),null,'Refresh response must not resurrect logged-out session');
    assert.equal(storage.has(api.CUSTOMER_TOKEN_KEY),false);
    console.log('PASS late refresh cannot resurrect customer logout');
  }
  {
    let releaseRefresh;
    const gate = new Promise(resolve => { releaseRefresh = resolve; });
    const {api,storage,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh')) return gate;
      if (entry.authorization === 'Bearer '+adminOld) return response(401,{error:'Expired'});
      if (entry.authorization === 'Bearer '+adminNew) return response(200,{ok:true});
      return response(500,{error:'Unexpected request'});
    });
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('admin-refresh-old');
    const pending = api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}})
      .catch(error => error);
    for(let tick=0;tick<50 && !refreshCalls(requests).length;tick++) await Promise.resolve();
    assert.equal(refreshCalls(requests).length,1,'A pending refresh must start before logout');
    api.clearAdminSession();
    releaseRefresh(response(200,{access_token:adminNew,refresh_token:'admin-refresh-new'}));
    await pending;
    assert.equal(storage.has(api.ADMIN_TOKEN_KEY),false,'Logout must win over late admin refresh');
    console.log('PASS admin logout cannot be resurrected by late refresh');
  }
  {
    const {api,storage,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh')) throw new Error('offline');
      if (entry.authorization === 'Bearer '+expired) return response(401,{error:'Expired'});
      return response(500,{error:'Unexpected request'});
    });
    api.setCustomerToken(expired);
    api.setCustomerRefreshToken('customer-refresh-old');
    await assert.rejects(()=>api.apiRequest('/api/auth/me'),e=>e.status===401);
    assert.equal(api.customerToken(),expired,'Transient refresh network errors must not delete access');
    assert.equal(storage.get(api.CUSTOMER_TOKEN_KEY),expired);
    assert.equal(refreshCalls(requests).length,1);
    console.log('PASS temporary connection failure preserves local session');
  }
  {
    const {api,storage,requests} = harness(entry => {
      if (entry.url.endsWith('/api/auth/refresh'))
        return response(200,{access_token:adminNew,refresh_token:'admin-refresh-new'});
      return response(403,{error:'Sin permisos'});
    });
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('admin-refresh-old');
    await assert.rejects(
      ()=>api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+adminOld}}),
      e=>e.status===403);
    assert.equal(refreshCalls(requests).length,0,'Admin 403 must never refresh');
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),adminOld);
    console.log('PASS admin forbidden status does not attempt refresh');
  }
  {
    let sawCleared = false;
    let api;
    const instance = harness(entry => {
      if (entry.url.endsWith('/api/auth/logout')) {
        sawCleared = api.customerToken() === null;
        assert.equal(entry.authorization,null,'Refresh logout should not rely on expired bearer');
        assert.deepEqual(JSON.parse(entry.body),{refresh_token:'customer-refresh-old'});
        return response(200,{message:'Sesión cerrada'});
      }
      return response(500,{error:'Unexpected request'});
    });
    api = instance.api;
    api.setCustomerToken(expired);
    api.setCustomerRefreshToken('customer-refresh-old');
    await api.logoutCurrentSession('customer');
    assert.ok(sawCleared,'Clear customer credentials before contacting logout endpoint');
    assert.equal(api.customerToken(),null);
    assert.equal(instance.requests.length,1);
    console.log('PASS expired customer logout uses refresh and clears memory first');
  }
  {
    let sawCleared = false;
    let api;
    let storage;
    const instance = harness(entry => {
      if (entry.url.endsWith('/api/auth/logout')) {
        sawCleared = !storage.has(api.ADMIN_TOKEN_KEY);
        assert.equal(entry.authorization,null);
        assert.deepEqual(JSON.parse(entry.body),{refresh_token:'admin-refresh-old'});
        return response(200,{message:'Sesión cerrada'});
      }
      return response(500,{error:'Unexpected request'});
    });
    api = instance.api; storage = instance.storage;
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    api.setAdminRefreshToken('admin-refresh-old');
    await api.logoutCurrentSession('admin');
    assert.ok(sawCleared,'Clear admin session before HTTP logout');
    assert.equal(storage.has(api.ADMIN_TOKEN_KEY),false);
    console.log('PASS expired admin logout uses refresh and clears memory first');
  }
  {
    const {api,storage,requests} = harness(entry => response(200,{message:'Sesión cerrada'}));
    storage.set(api.ADMIN_TOKEN_KEY,adminOld);
    await api.logoutCurrentSession('admin');
    assert.equal(requests[0].authorization,'Bearer '+adminOld,
      'Legacy access-only browser sessions must still logout');
    assert.deepEqual(JSON.parse(requests[0].body),{});
    console.log('PASS access-only legacy browser session still logs out');
  }
  {
    const {api,requests} = harness(entry => response(401,{error:'Expired'}));
    api.setCustomerToken(expired);api.setCustomerRefreshToken('customer-refresh-old');
    await assert.rejects(()=>api.apiRequest('/api/auth/logout',{method:'POST'}),e=>e.status===401);
    assert.equal(refreshCalls(requests).length,0,'Logout must not auto-refresh');
    console.log('PASS logout never retries refresh');
  }
  {
    const old=accessToken(Math.floor(Date.now()/1000)-60,'cookie-old','browser-session','admin');
    const next=accessToken(Math.floor(Date.now()/1000)+3600,'cookie-new','browser-session','admin');
    let offline=false;
    const {api,requests,storage,local}=harness(entry=>{
      if(entry.url==='/api/admin-session/login')return response(200,{access_token:old,user:{id:'admin-a',role:'admin'}});
      if(entry.url==='/api/admin-session/refresh'){
        if(offline)return response(503,{error:'offline'});
        return response(200,{access_token:next});
      }
      if(entry.url==='/api/admin-session/logout')return response(200,{message:'Sesión cerrada'});
      if(entry.authorization==='Bearer '+old)return response(401,{error:'expired'});
      if(entry.authorization==='Bearer '+next)return response(200,{user:{id:'admin-a'}});
      return response(500,{error:'Unexpected request'});
    },true);
    await api.loginAdminBrowser({email:'test@invalid.example',password:'synthetic',remember:true});
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),old);
    assert.equal(storage.get('energia_vital_admin_browser'),'1');
    offline=true;
    await assert.rejects(()=>api.apiRequest('/api/auth/admin/me',{headers:{Authorization:'Bearer '+old}}),e=>e.status===503);
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),old,'Temporary failure preserves cookie-mode access');
    offline=false;
    const results=await Promise.all([
      api.apiRequest('/api/auth/admin/me',{headers:{Authorization:'Bearer '+old}}),
      api.apiRequest('/api/admin/users',{headers:{Authorization:'Bearer '+old}})
    ]);
    assert.equal(results[0].user.id,'admin-a');
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),next);
    assert.equal(requests.filter(r=>r.url==='/api/admin-session/refresh').length,2,'One failed attempt and one concurrent renewal');
    const cookieRefresh=requests.find(r=>r.url==='/api/admin-session/refresh');
    assert.deepEqual(JSON.parse(cookieRefresh.body),{sid:'browser-session'});
    await api.logoutCurrentSession('admin');
    assert.equal(storage.has(api.ADMIN_TOKEN_KEY),false);
    assert.equal(local.get('energia_vital_admin_signed_out'),'1');
    const before=requests.length;assert.equal(await api.restoreAdminBrowserAccess(),null);assert.equal(requests.length,before);
    console.log('PASS cookie admin automatic renewal, temporary network errors, concurrent requests and logout');
  }
  {
    const token=accessToken(Math.floor(Date.now()/1000)+3600,'restored','browser-session','admin');
    const {api,requests,storage}=harness(entry=>response(200,{access_token:token}),true);
    assert.equal(await api.restoreAdminBrowserAccess(),token);
    assert.equal(requests[0].url,'/api/admin-session/refresh');
    assert.deepEqual(JSON.parse(requests[0].body),{});
    assert.equal(storage.get(api.ADMIN_TOKEN_KEY),token);
    assert.equal(await api.restoreAdminBrowserAccess(),token);
    assert.equal(requests.length,1);
    console.log('PASS cookie restores a new tab without storing refresh secrets');
  }
  {
    const old=accessToken(Math.floor(Date.now()/1000)-60,'customer-cookie-old','public-session','customer');
    const next=accessToken(Math.floor(Date.now()/1000)+3600,'customer-cookie-new','public-session','customer');
    const {api,requests,storage,local}=harness(entry=>{
      if(entry.url==='/api/admin-session/sign-in')return response(200,{access_token:old,user:{id:'customer-a',role:'customer'}});
      if(entry.url==='/api/admin-session/refresh'){
        const body=JSON.parse(entry.body);if(body.kind!=='customer'&&body.kind!=='any')return response(401);
        return response(200,{access_token:next});
      }
      if(entry.url==='/api/admin-session/logout')return response(200,{message:'Sesión cerrada'});
      if(entry.authorization==='Bearer '+old)return response(401);
      if(entry.authorization==='Bearer '+next)return response(200,{user:{id:'customer-a'}});
      return response(500);
    },true);
    const result=await api.signInSite({email:'customer@invalid.example',password:'synthetic',remember:true});
    assert.equal(result.browser_session,true);assert.equal(api.customerToken(),old);assert.equal(storage.get('energia_vital_customer_browser'),'1');
    assert.equal(JSON.parse(requests[0].body).remember,true);
    await Promise.all([api.apiRequest('/api/auth/me'),api.apiRequest('/api/private/requests')]);
    assert.equal(api.customerToken(),next);assert.equal(requests.filter(r=>r.url==='/api/admin-session/refresh').length,1);
    assert.deepEqual(JSON.parse(requests.find(r=>r.url==='/api/admin-session/refresh').body),{kind:'customer',sid:'public-session'});
    assert.equal(await api.restoreAdminBrowserAccess(),null,'Customer cookie cannot restore admin');
    api.setCustomerToken(null);
    const restored=await api.restorePublicBrowserAccess();assert.equal(restored.kind,'customer');assert.equal(restored.token,next);
    await api.logoutCurrentSession('customer');assert.equal(api.customerToken(),null);assert.equal(local.get('energia_vital_admin_signed_out'),'1');
    assert.deepEqual(JSON.parse(requests.at(-1).body),{kind:'customer',sid:'public-session'});
    assert.equal(await api.restorePublicBrowserAccess(),null);
    console.log('PASS public customer remember, parallel renewal, role isolation, browser restoration and logout');
  }
  {
    const token=accessToken(Math.floor(Date.now()/1000)+3600,'public-admin','shared-admin','admin');
    const {api,storage}=harness(entry=>response(200,{access_token:token,user:{id:'admin-a',role:'admin'}}),true);
    await api.signInSite({email:'admin@invalid.example',password:'synthetic',remember:false});
    assert.equal(await api.restoreAdminBrowserAccess(),token);
    assert.equal(storage.get('energia_vital_admin_browser'),'1');
    assert.equal(api.customerToken(),null);
    console.log('PASS public administrator sign-in shares cookie state with admin panel');
  }
})().catch(error=>{console.error(error);process.exitCode=1});
