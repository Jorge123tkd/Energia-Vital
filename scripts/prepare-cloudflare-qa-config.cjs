#!/usr/bin/env node
'use strict';
// Prepara configuración Wrangler aislada. No conecta con Cloudflare ni despliega.
// Requiere identificadores y nombres de recursos QA ya creados por el propietario.
// Jamás hereda triggers, D1 o R2 de producción.
const fs=require('node:fs');
const path=require('node:path');
const PROD_D1='bbb91e7a-37c6-4290-aa9c-29a8022226b4';
const PROD_DB='energia-vital-db';
const PROD_BUCKET='energia-vital-assets';
const PROD_WORKER='energia-vital-api';
const PROD_PAGES='energia-vital-web';
function required(value,label) {
  if(!value || typeof value!=='string') throw Error('Falta '+label);
  return value.trim();
}
function validate(input) {
  const d1id=required(input.QA_D1_DATABASE_ID,'QA_D1_DATABASE_ID');
  const d1name=required(input.QA_D1_DATABASE_NAME,'QA_D1_DATABASE_NAME');
  const bucket=required(input.QA_R2_BUCKET_NAME,'QA_R2_BUCKET_NAME');
  const worker=required(input.QA_WORKER_NAME,'QA_WORKER_NAME');
  const pages=required(input.QA_PAGES_PROJECT,'QA_PAGES_PROJECT');
  const api=required(input.QA_API_URL,'QA_API_URL');
  const site=required(input.QA_SITE_URL,'QA_SITE_URL');
  if(!/^[0-9a-f-]{36}$/i.test(d1id) || d1id.toLowerCase()===PROD_D1)
    throw Error('D1 QA inválida o idéntica a producción');
  for(const [label,value,prod] of [['D1',d1name,PROD_DB],['R2',bucket,PROD_BUCKET],
      ['Worker',worker,PROD_WORKER],['Pages',pages,PROD_PAGES]]) {
    if(!/^[a-z0-9][a-z0-9-]{2,62}$/.test(value)||value===prod||!/(?:^|-)qa(?:-|$)/.test(value))
      throw Error(label+' debe ser un nombre QA separado y no producción');
  }
  let parsedApi,parsedSite;
  try {parsedApi=new URL(api);parsedSite=new URL(site); }
  catch {throw Error('Las URL QA deben ser absolutas y HTTPS');}
  if([parsedApi,parsedSite].some(u=>u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'))
    throw Error('URL QA inválida');
  if(!parsedApi.hostname.endsWith('.workers.dev')||!parsedSite.hostname.endsWith('.pages.dev'))
    throw Error('QA debe usar dominios Cloudflare independientes');
  if(!parsedApi.hostname.startsWith(worker+'.')||!(parsedSite.hostname===pages+'.pages.dev'))
    throw Error('Los dominios QA no corresponden a Worker/Pages aislados');
  return {d1id,d1name,bucket,worker,pages,api:parsedApi.origin,site:parsedSite.origin};
}
function render(cfg) {
  const toml=s=>JSON.stringify(s);
  return [
    'name = '+toml(cfg.worker),
    'main = "src/index.ts"',
    'compatibility_date = "2024-11-01"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = '+toml(cfg.d1name),
    'database_id = '+toml(cfg.d1id),
    '',
    '[[r2_buckets]]',
    'binding = "BUCKET"',
    'bucket_name = '+toml(cfg.bucket),
    '',
    '[vars]',
    'ENVIRONMENT = "qa"',
    'SITE_URL = '+toml(cfg.site),
    'WORKERS_AI_ENABLED = "false"',
    'WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"',
    // Sin triggers cron: el despliegue de ensayo no programa recordatorios.
    ''
  ].join('\n');
}
if(require.main===module) {
  try {
    const cfg=validate(process.env);
    const output=path.resolve(process.argv[2]||'apps/api/wrangler.qa.generated.toml');
    fs.writeFileSync(output,render(cfg),{flag:'wx',mode:0o600});
    console.log('Configuración QA aislada validada; no se ha desplegado.');
  } catch(e) {console.error('QA BLOQUEADA: '+e.message); process.exitCode=1;}
}
module.exports={validate,render};
