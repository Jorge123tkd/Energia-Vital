#!/usr/bin/env node
'use strict';
// Evita publicar Pages QA compilada contra la API de producción.
// No conecta con Cloudflare ni crea recursos.
const assert=require('node:assert/strict');
const {validate}=require('./prepare-cloudflare-qa-config.cjs');
function assertQaBuild(env){
  const cfg=validate(env);
  assert.equal(env.VITE_QA_MODE,'true','QA debe incluir cookies Cloudflare Access');
  assert.equal(env.VITE_API_URL,cfg.api,'El frontend QA debe hablar con Worker QA exacto');
  assert.notEqual(cfg.api,'https://energia-vital-api.astrustrus.workers.dev',
    'Nunca apuntar a API de producción');
  assert.notEqual(cfg.site,'https://energia-vital-web.pages.dev',
    'Nunca apuntar a Pages de producción');
  return true;
}
if(require.main===module){
  try {assertQaBuild(process.env);console.log('PASS: Pages QA apunta únicamente al Worker QA aislado');}
  catch(e){console.error('QA BLOQUEADA: '+e.message);process.exitCode=1;}
}
module.exports={assertQaBuild};
