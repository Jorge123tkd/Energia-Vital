'use strict';
const assert=require('node:assert/strict');
const {goodPolicy,assertApps}=require('./verify-qa-access.cjs');
const cfg={api:'https://energia-vital-api-qa.my-subdomain.workers.dev',
  site:'https://energia-vital-qa-web.pages.dev',accessAud:'qa-access-audience-123',
  worker:'energia-vital-api-qa'};
const worker={id:'11111111-1111-1111-1111-111111111111',name:'Access for energia-vital-api-qa',
  type:'self_hosted',aud:cfg.accessAud,destinations:[{type:'worker',worker_id:'real-qa-worker'}]};
const main={id:'22222222-2222-2222-2222-222222222222',
  type:'self_hosted',domain:'energia-vital-qa-web.pages.dev'};
const preview={id:'33333333-3333-3333-3333-333333333333',
  type:'self_hosted',domain:'*.energia-vital-qa-web.pages.dev'};
const allow={decision:'allow',include:[{email:{email:'tester@example.com'}}]};
const policies=Object.fromEntries([worker,main,preview].map(x=>[x.id,[allow]]));
assert.deepEqual(assertApps([worker,main,preview],cfg,policies),
  {worker:worker.id,main:main.id,previews:preview.id});
assert.equal(goodPolicy({decision:'allow',include:[{everyone:{}}]}),false);
assert.equal(goodPolicy({decision:'allow',include:[{email_domain:{domain:'example.com'}}]}),false);
assert.equal(goodPolicy({decision:'allow',include:[{email:{email:'qa@example.com'}}]}),true);
assert.throws(()=>assertApps([{...worker,destinations:[{type:'preview_worker'}]},main,preview],cfg,policies));
assert.throws(()=>assertApps([worker,main],cfg,policies));
assert.throws(()=>assertApps([worker,preview],cfg,policies));
assert.throws(()=>assertApps([worker,main,preview],cfg,
  {...policies,[main.id]:[{decision:'bypass',include:[{everyone:{}}]}]}));
assert.throws(()=>assertApps([worker,main,preview],cfg,
  {...policies,[worker.id]:[{decision:'allow',include:[{everyone:{}}]}]}));
console.log('PASS QA Access gate blocks missing main/preview/Worker and permissive rules');
