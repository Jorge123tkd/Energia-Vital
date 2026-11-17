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
  .replace("import.meta.env.VITE_API_URL", "''");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function accessToken(exp, nonce) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  return encode({alg:'none'}) + '.' + encode({exp, nonce}) + '.test';
}
const expired = accessToken(Math.floor(Date.now()/1000) - 60, 'old');
const valid = accessToken(Math.floor(Date.now()/1000) + 3600, 'new');
const adminOld = accessToken(Math.floor(Date.now()/1000) - 60, 'admin-old');
const adminNew = accessToken(Math.floor(Date.now()/1000) + 3600, 'admin-new');

function harness(handler) {
  const storage = new Map();
  const exports = {};
  const requests = [];
  const sessionStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  const context = vm.createContext({
    exports, sessionStorage, Headers, FormData,
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
  return { api:exports, requests, storage };
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
    const {api,requests} = harness(entry => response(401,{error:'Expired'}));
    api.setCustomerToken(expired);api.setCustomerRefreshToken('customer-refresh-old');
    await assert.rejects(()=>api.apiRequest('/api/auth/logout',{method:'POST'}),e=>e.status===401);
    assert.equal(refreshCalls(requests).length,0,'Logout must not auto-refresh');
    console.log('PASS logout never retries refresh');
  }
})().catch(error=>{console.error(error);process.exitCode=1});
