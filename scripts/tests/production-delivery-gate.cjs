// Read-only production gate for the newly deployed signed delivery endpoint.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const worker='https://energia-vital-api.astrustrus.workers.dev';
const source=readFileSync(resolve(__dirname,'../../apps/api/src/routes/delivery.ts'),'utf8');
assert.match(source,/requireAdminAuth/);
(async()=>{
 const r=await fetch(worker+'/api/quotes/contracts/execution/delivery/nonexistent',{method:'GET',headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,401,'Delivery route must reject anonymous access');
 assert.match(r.headers.get('content-type')||'',/^application\/json/i);
 assert.equal(r.headers.get('location'),null);
 const body=await r.json();assert.ok(body&&typeof body.error==='string');
 console.log('[OK] Endpoint de entrega publicado y protegido: 401 JSON sin sesion.');
})().catch(e=>{console.error('[FAIL] Gate de entrega:',e.message);process.exitCode=1});
