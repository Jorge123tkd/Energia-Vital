#!/usr/bin/env node
'use strict';
// Preflight READ-ONLY. Niega publicación si Access no está configurado o no es verificable.
// El token del flujo necesita Access: Apps and Policies Read (no escribir Access).
const assert=require('node:assert/strict');
const {validate}=require('./prepare-cloudflare-qa-config.cjs');
function must(x,label){if(!x)throw Error('QA BLOQUEADA: '+label);return x;}
function goodPolicy(p){
  if(!p || p.decision!=='allow' || !Array.isArray(p.include) || !p.include.length)return false;
  // Lista explícita de correos individuales. Ni Everyone, ni dominio entero, ni bypass.
  return p.include.every(rule=>{
    const keys=Object.keys(rule||{});
    return keys.length===1 && keys[0]==='email' &&
      typeof rule.email?.email==='string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rule.email.email);
  });
}
function appHost(app){
  return String(app.domain||'').replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
}
function assertApps(apps,cfg,policies){
  assert(Array.isArray(apps),'Access: respuesta sin aplicaciones');
  const apiHost=new URL(cfg.api).hostname;
  const pagesHost=new URL(cfg.site).hostname;
  // Con Worker-level Access requerimos la aplicación exacta indicada por su aud.
  // 'worker' protege tráfico normal y previews; 'preview_worker' no es suficiente.
  const worker=apps.find(app=>app.type==='self_hosted' && app.aud===cfg.accessAud &&
    Array.isArray(app.destinations) &&
    app.destinations.some(dest=>dest.type==='worker') &&
    (String(app.name||'').toLowerCase().includes(cfg.worker) ||
     appHost(app)===apiHost));
  must(worker,'No hay una aplicación Access Worker QA (All traffic) con la audiencia indicada');
  // Pages requiere aplicaciones para la URL principal y también para *.project.pages.dev.
  const main=apps.find(app=>app.type==='self_hosted' && appHost(app)===pagesHost);
  const previews=apps.find(app=>app.type==='self_hosted' &&
    appHost(app)==='*.'+pagesHost);
  must(main,'Falta Access en el dominio principal Pages QA');
  must(previews,'Falta Access en previews Pages QA');
  for(const app of [worker,main,previews]){
    if(app.bypass)throw Error('QA BLOQUEADA: bypass Access en '+app.name);
    const rules=must(policies[app.id],'No se pueden leer políticas de '+app.name);
    if(!rules.length || !rules.some(goodPolicy) ||
       rules.some(p=>p.decision==='bypass' || p.decision==='non_identity' ||
         (p.decision==='allow' && !goodPolicy(p))))
      throw Error('QA BLOQUEADA: políticas no restringidas a correos individuales en '+app.name);
  }
  return {worker:worker.id,main:main.id,previews:previews.id};
}
async function cloudflareGet(path,token){
  const res=await fetch('https://api.cloudflare.com/client/v4'+path,{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    redirect:'error'
  });
  if(!res.ok)throw Error('Cloudflare Access consulta fallida HTTP '+res.status);
  const json=await res.json();
  if(json.success!==true || !Array.isArray(json.result))
    throw Error('Cloudflare Access devolvió respuesta incompleta');
  return json.result;
}
async function verify(env){
  const cfg=validate(env);
  must(env.CLOUDFLARE_API_TOKEN,'Falta token Cloudflare de solo lectura Access');
  const account=must(env.CLOUDFLARE_ACCOUNT_ID,'Falta Account ID');
  if(!/^[a-f0-9]{32}$/i.test(account))throw Error('Account ID inválido');
  const prefix='/accounts/'+account+'/access/apps';
  const apps=[];
  for(let page=1;page<=20;page++){
    const batch=await cloudflareGet(prefix+'?page='+page+'&per_page=100',env.CLOUDFLARE_API_TOKEN);
    apps.push(...batch);
    if(batch.length<100)break;
    if(page===20)throw Error('Demasiadas aplicaciones Access: revisar paginación');
  }
  const relevant=apps.filter(a=>a.aud===cfg.accessAud ||
    appHost(a)===new URL(cfg.site).hostname ||
    appHost(a)==='*.'+new URL(cfg.site).hostname);
  const policies={};
  for(const app of relevant){
    if(!app.id || !/^[a-f0-9-]{36}$/i.test(app.id))throw Error('Access app ID inválido');
    policies[app.id]=await cloudflareGet(prefix+'/'+app.id+'/policies?per_page=100',env.CLOUDFLARE_API_TOKEN);
  }
  assertApps(apps,cfg,policies);
  console.log('PASS: Access configurado en Worker QA, Pages principal y previews; solo correos individuales');
}
if(require.main===module){
  verify(process.env).catch(e=>{console.error('QA BLOQUEADA: '+e.message);process.exitCode=1});
}
module.exports={goodPolicy,assertApps};
