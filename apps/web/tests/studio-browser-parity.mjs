import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=await import(pathToFileURL(process.env.EV_PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let manifest={snapshot:null,rev:''};const assets=new Map();
 await page.route('**/api/studio/v1/engineering/**',async route=>{
  const req=route.request(),suffix=new URL(req.url()).pathname.split('/engineering/')[1],method=req.method();
  const reply=(json,status=200)=>route.fulfill({status,json});
  if(suffix==='manifest'&&method==='GET')return reply(manifest);
  if(suffix==='manifest'&&method==='PUT'){const b=req.postDataJSON();if(b.expected!==manifest.rev)return reply({error:'conflicto QA'},409);manifest={snapshot:b.snapshot,rev:b.rev};return reply({ok:true,rev:b.rev})}
  if(suffix==='assets/check'&&method==='POST')return reply({present:req.postDataJSON().hashes.filter(h=>assets.has(h))});
  if(/^assets\/[a-f0-9]{64}$/.test(suffix)){const hash=suffix.slice(7);if(method==='GET')return reply({data:assets.get(hash)});const {data}=req.postDataJSON();assert.equal(createHash('sha256').update(data).digest('hex'),hash);assets.set(hash,data);return reply({ok:true,hash})}
  return reply({error:'Ruta no simulada'},404);
 });
 await page.goto('http://127.0.0.1:5173/tests/fixtures/studio-parity.html');
 const frameEl=await page.waitForSelector('iframe[title="EV Pro Ingeniería original"]');
 const frame=await frameEl.contentFrame();assert.ok(frame);
 await frame.waitForFunction(()=>typeof offlineReady!=='undefined'&&offlineReady&&!!centralAccount,{},{timeout:30000});
 await frame.evaluate(async()=>{const c={...newCompany(),name:'Empresa QA'};state.companies.push(c);const p=newProject(c.id,'Proyecto QA','Prueba de paridad','Personalizado',['Fotovoltaica','Baterías','ATS y respaldo'],['Sede QA']);p.sites[0].work=66;p.sites[0].panels=120;p.sites[0].watts=600;state.projects.push(p);touch();await manualSaveNow()});
 assert.ok(manifest.snapshot.projects.length===1);
 const audit=await frame.evaluate(()=>{const result=[],p=state.projects[0];const inspect=()=>{const root=document.getElementById('main');const handlers=[];const unresolved=[];for(const el of root.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit]'))for(const attr of ['onclick','onchange','oninput','onsubmit']){const code=el.getAttribute(attr);if(!code)continue;handlers.push(code);const first=code.match(/^([A-Za-z_$][\w$]*)\s*\(/);if(first&&first[1]!=='void'&&typeof ({$: $,site:site}[first[1]]??globalThis[first[1]])!=='function')unresolved.push(first[1])}return {page,controls:root.querySelectorAll('button,input,select,textarea').length,handlers,unresolved}};for(const [key] of MAIN){nav(key);result.push(inspect())}for(const [key] of SUB){openProject(p.id,key);result.push(inspect())}return result});
 console.log('Engineering audit: '+JSON.stringify(audit.map(({page,controls,unresolved})=>({page,controls,unresolved}))));assert.equal(audit.length,22);assert.deepEqual(audit.flatMap(x=>x.unresolved),[]);for(const row of audit){assert.ok(row.controls>0,row.page);for(const code of row.handlers)new Function('event',code)}
 console.log('PASS 22 engineering views in real Chromium: '+JSON.stringify(audit.map(x=>[x.page,x.controls])));
 // All commercial navigation destinations reach the real authenticated parent.
 for(const section of ['team','catalog','backup','inventory','finance','publication']){
  await frame.locator('[data-studio-section="'+section+'"]').click();await page.getByTestId('business-section').filter({hasText:section}).waitFor();await page.getByRole('button',{name:'Volver a ingeniería',exact:true}).click();
 }
 await frame.evaluate(()=>openProject(state.projects[0].id,'export'));
 await frame.getByRole('button',{name:'Vista previa de resumen',exact:true}).click();
 const overlay=page.getByRole('dialog',{name:'Vista previa de informe'});await overlay.waitFor();
 const print=overlay.getByRole('button',{name:'Imprimir / guardar PDF'});assert.ok(await print.isDisabled());
 await overlay.getByRole('checkbox').check();await print.waitFor();await page.waitForFunction(()=>!document.querySelector('.output-actions button.primary').disabled);
 // Actual browser frame is isolated, printable and populated; intercept only the
 // OS-dependent print dialog to assert the user action reaches window.print().
 const reportFrame=await (await page.waitForSelector('iframe[title="Documento de informe sin scripts"]')).contentFrame();
 assert.ok(reportFrame);await reportFrame.evaluate(()=>{window.print=()=>{window.__qaPrinted=true}});await print.click();assert.equal(await reportFrame.evaluate(()=>window.__qaPrinted),true);
 const htmlDownload=page.waitForEvent('download');await overlay.getByRole('button',{name:'Descargar HTML',exact:true}).click();const html=await htmlDownload;assert.match(html.suggestedFilename(),/\.html$/);assert.match(await readFile(await html.path(),'utf8'),/Proyecto QA/);
 await overlay.getByRole('button',{name:'Confirmar revisión y volver'}).click();await frame.waitForFunction(()=>document.getElementById('reviewed').checked);
 await frame.getByRole('button',{name:'Guardar revisión del informe',exact:true}).click();await frame.locator('#modalForm button[type=submit]').click();
 await frame.waitForFunction(()=>!document.getElementById('dialog').open&&!pendingSave(),{},{timeout:30000});
 assert.equal(manifest.snapshot.projects[0].reportHistory.length,1);assert.ok(assets.size>0);
 // Reload the real app and ensure an archived revision can be opened again.
 await page.reload();const fresh=await (await page.waitForSelector('iframe[title="EV Pro Ingeniería original"]')).contentFrame();await fresh.waitForFunction(()=>typeof offlineReady!=='undefined'&&offlineReady&&!!centralAccount,{},{timeout:30000});await fresh.evaluate(()=>openProject(state.projects[0].id,'export'));
 assert.equal(await fresh.evaluate(()=>project().reportHistory.length),1);
 await fresh.getByRole('button',{name:'Descargar copia',exact:true}).click();const save=page.getByRole('dialog',{name:'Guardar archivo'});await save.waitFor();const archivedPromise=page.waitForEvent('download');await save.getByRole('button',{name:'Descargar archivo',exact:true}).click();const archived=await archivedPromise;assert.match(await readFile(await archived.path(),'utf8'),/Proyecto QA/);
 await fresh.evaluate(()=>backupCompany(state.companies[0].id));await save.waitFor();const backupPromise=page.waitForEvent('download');await save.getByRole('button',{name:'Descargar archivo',exact:true}).click();const backup=await backupPromise;assert.equal(JSON.parse(await readFile(await backup.path(),'utf8')).projects.length,1);
 assert.deepEqual(errors,[]);console.log('PASS Chromium: approval, print dispatch, real HTML download, persisted report and company backup; simulated API only');
}finally{await browser.close()}
