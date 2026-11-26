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
  if(suffix==='pdf'&&method==='GET')return reply({available:false});
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

 // Regression for the customer's PDF: the original global SVG width rule
 // pushed the corporate name outside the page. Exercise actual print geometry.
 const brandedDocuments=await frame.evaluate(()=>{
  const c=state.companies[0],p=state.projects[0];
  const cfg=reportConfig(p);cfg.sections=['summary'];cfg.scenarios=['active'];
  return [companyExportSummaryHTML(c,[p]),clientPage('Solicitud técnica de cotización','<section><h2>Materiales QA</h2></section>',false),reportHTML(p,cfg),clientPage('Identidad larga','<section>QA</section>',false,'',{name:'Bonaire Energía Vital · '+ 'Nombre empresarial muy largo '.repeat(3),division:'División de ingeniería y proyectos',footer:'Bonaire'})];
 });
 const corporatePage=await context.newPage();
 await corporatePage.route('**/*',r=>r.abort());
 for(let n=0;n<brandedDocuments.length;n++){
  await corporatePage.setViewportSize({width:n===1?1030:702,height:1020});
  await corporatePage.emulateMedia({media:'print'});
  await corporatePage.setContent(brandedDocuments[n]);
  const layout=await corporatePage.locator('.ev-client-header').first().evaluate(h=>{
   const logo=h.querySelector('.ev-brand-mark'),name=h.querySelector('.ev-brand-copy'),title=h.querySelector('h1'),r=h.getBoundingClientRect(),a=logo.getBoundingClientRect(),b=name.getBoundingClientRect(),t=title.getBoundingClientRect();
   return {width:r.width,height:r.height,logoWidth:a.width,logoHeight:a.height,logoLeft:a.left,logoRight:a.right,copyLeft:b.left,copyRight:b.right,headerLeft:r.left,headerRight:r.right,titleRight:t.right,copyOverflow:name.scrollWidth-name.clientWidth,visibleName:name.textContent};
  });
  assert.ok(layout.logoWidth>=40&&layout.logoWidth<=50,JSON.stringify(layout));
  assert.ok(Math.abs(layout.logoWidth-layout.logoHeight)<1,JSON.stringify(layout));
  assert.ok(layout.copyLeft>=layout.logoRight&&layout.copyRight<=layout.headerRight+1&&layout.titleRight<=layout.headerRight+1,JSON.stringify(layout));
  assert.ok(layout.copyOverflow<=1&&layout.height<220,JSON.stringify(layout));
  assert.match(layout.visibleName,/Bonaire/);
  const pdf=await corporatePage.pdf({printBackground:true,preferCSSPageSize:true});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.ok(pdf.length>1000);
 }
 await corporatePage.close();
 console.log('PASS corporate PDF layout: summary, RFQ, coverless report and long brand name; bounded original SVG and complete identity');
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

 // Test direct print/PDF controls and the downloadable interactive delivery.
 await fresh.locator('#reviewed').check();
 for(const button of ['Imprimir resumen cliente','Guardar PDF']){
  await fresh.getByRole('button',{name:button,exact:true}).click();await overlay.waitFor();
  const printable=await (await page.waitForSelector('iframe[title="Documento de informe sin scripts"]')).contentFrame();
  await printable.evaluate(()=>{window.print=()=>{window.__qaPrinted=true}});
  await overlay.getByRole('button',{name:'Imprimir / guardar PDF'}).click();
  assert.equal(await printable.evaluate(()=>window.__qaPrinted),true);
  await overlay.getByRole('button',{name:'Confirmar revisión y volver'}).click();
  await fresh.waitForFunction(()=>document.getElementById('reviewed').checked);
 }
 async function takeZip(button){
  await fresh.getByRole('button',{name:button,exact:true}).click();
  await save.waitFor();
  const event=page.waitForEvent('download');await save.getByRole('button',{name:'Descargar archivo',exact:true}).click();
  const file=await event;return readFile(await file.path());
 }
 const {inflateRawSync}=await import('node:zlib');
 function zipEntries(bytes){
  const entries=new Map();let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50){eocd=p;break}
  assert.ok(eocd>=0,'ZIP without central directory');
  let p=bytes.readUInt32LE(eocd+16),count=bytes.readUInt16LE(eocd+10);
  for(let n=0;n<count;n++){
   assert.equal(bytes.readUInt32LE(p),0x02014b50);
   const method=bytes.readUInt16LE(p+10),size=bytes.readUInt32LE(p+20),nameLen=bytes.readUInt16LE(p+28),extra=bytes.readUInt16LE(p+30),comment=bytes.readUInt16LE(p+32),offset=bytes.readUInt32LE(p+42);
   const name=bytes.subarray(p+46,p+46+nameLen).toString('utf8');
   assert.equal(bytes.readUInt32LE(offset),0x04034b50);
   const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),raw=bytes.subarray(start,start+size);
   assert.ok([0,8].includes(method));entries.set(name,method===8?inflateRawSync(raw):raw);p+=46+nameLen+extra+comment;
  }return entries;
 }
 const delivery=zipEntries(await takeZip('Descargar ZIP'));
 assert.ok(delivery.has('index.html'));assert.ok(delivery.has('Informe_ejecutivo.html'));
 const simulator=[...delivery.keys()].find(n=>n.endsWith('_simulador.html'));assert.ok(simulator);
 const exported=await context.newPage();const exportErrors=[];exported.on('pageerror',e=>exportErrors.push(e.message));
 await exported.route('**/*',r=>r.abort());await exported.setContent(delivery.get(simulator).toString('utf8'));
 await exported.locator('#results').getByRole('heading',{name:/Resultados de simulación/}).waitFor();
 await exported.getByRole('button',{name:'48 h',exact:true}).click();
 await exported.locator('#results').getByRole('heading',{name:/48 h/}).waitFor();
 assert.deepEqual(exportErrors,[]);await exported.close();
 console.log('PASS direct print, save PDF dispatch and actual ZIP with interactive simulator 24/48 hours');
 await fresh.evaluate(()=>backupCompany(state.companies[0].id));await save.waitFor();const backupPromise=page.waitForEvent('download');await save.getByRole('button',{name:'Descargar archivo',exact:true}).click();const backup=await backupPromise;assert.equal(JSON.parse(await readFile(await backup.path(),'utf8')).projects.length,1);
 assert.deepEqual(errors,[]);console.log('PASS Chromium: approval, print dispatch, real HTML download, persisted report and company backup; simulated API only');

 // Run the actual commercial component against isolated fixtures. Verify every
 // posted body in the same browser used for the engineering tests.
 const commercial=await context.newPage();commercial.on('dialog',d=>d.accept());
 const posts=[],orders=[{id:'order1',project_id:'p1',supplier_id:'supplier1',supplier_name:'Proveedor QA',currency:'USD',reference:'PO-QA',status:'ordered'},{id:'other',project_id:'p2',supplier_id:'supplier1',supplier_name:'Proveedor QA',currency:'EUR',reference:'Otro pedido',status:'ordered'}];
 await commercial.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const reply=json=>route.fulfill({status:200,json});
  if(req.method()==='POST'){posts.push({path,body:req.postDataJSON()});return reply({ok:true})}
  if(path==='/api/warehouse/items')return reply({items:[{id:'item1',name:'Panel QA',unit:'unit'}],next:null});
  if(path==='/api/warehouse/procurement/suppliers')return reply({suppliers:[{id:'supplier1',name:'Proveedor QA',active:1}],next:null});
  if(path==='/api/warehouse/procurement/orders')return reply({orders,next:null});
  if(path==='/api/warehouse/procurement/orders/order1')return reply({order:orders[0],lines:[{id:'line1',name:'Panel QA',unit:'unit',outstanding_milli:2000,received_milli:1000}]});
  if(path==='/api/business-finance/payables')return reply({payables:[{id:'pay1',project_id:'p1',supplier_name:'Proveedor QA',document_reference:'Factura QA',currency:'USD',outstanding_minor:5000},{id:'pay2',project_id:'p2',supplier_name:'Otro proveedor',currency:'EUR',outstanding_minor:9000},{id:'paid',project_id:'p1',supplier_name:'Pagado',currency:'USD',outstanding_minor:0}],next:null});
  return route.fulfill({status:404,json:{error:'Ruta QA no encontrada'}});
 });
 const go=mode=>commercial.goto('http://127.0.0.1:5173/tests/fixtures/studio-parity.html?commercial='+mode);
 const field=name=>commercial.locator('[name="'+name+'"]');
 const submit=async()=>{await commercial.getByRole('button',{name:'Confirmar registro',exact:true}).click();await commercial.getByText('Operación confirmada por el servidor.',{exact:true}).waitFor()};
 await go('inventory');await commercial.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await field('kind').waitFor();
 assert.equal(await field('projectId').count(),0);await field('kind').selectOption('issue');assert.ok(await field('workId').isVisible());await field('kind').selectOption('receive');assert.equal(await field('workId').count(),0);
 await field('itemId').selectOption('item1');await field('quantity').fill('2.5');await field('reference').fill('Entrada QA');await submit();
 assert.equal(posts.at(-1).body.quantityMilli,2500);assert.equal(posts.at(-1).body.projectId,null);assert.equal(posts.at(-1).body.workId,null);
 await go('orders');await commercial.getByRole('button',{name:'Gestionar pedido y recepción',exact:true}).click();await commercial.locator('select').filter({has:commercial.locator('option[value="order1"]')}).selectOption('order1');await field('decision').waitFor();
 assert.deepEqual(await field('decision').locator('option').evaluateAll(o=>o.map(x=>x.value)),['','receive']);
 await field('lineId').selectOption('line1');await field('quantity').fill('2');await field('reference').fill('Recepción QA');await submit();assert.equal(posts.at(-1).path,'/api/warehouse/procurement/receipts');assert.equal(posts.at(-1).body.quantityMilli,2000);
 await go('finance');await commercial.getByRole('button',{name:'Registrar obligación documentada',exact:true}).click();await field('purchaseOrderId').waitFor();
 assert.deepEqual(await field('purchaseOrderId').locator('option').evaluateAll(o=>o.map(x=>x.value)),['','order1']);await field('purchaseOrderId').selectOption('order1');assert.equal(await field('currency').count(),0);assert.equal(await field('supplierId').count(),0);
 await field('amount').fill('40.50');await field('reference').fill('Factura QA');await field('date').fill('2025-01-01');await field('evidence').fill('Evidencia ficticia de una factura QA');await submit();assert.deepEqual({supplier:posts.at(-1).body.supplierId,currency:posts.at(-1).body.currency,order:posts.at(-1).body.purchaseOrderId,amount:posts.at(-1).body.amountMinor},{supplier:'supplier1',currency:'USD',order:'order1',amount:4050});
 await commercial.getByRole('button',{name:'Registrar pago a proveedor',exact:true}).click();await field('obligationId').waitFor();assert.deepEqual(await field('obligationId').locator('option').evaluateAll(o=>o.map(x=>x.value)),['','pay1']);
 await field('obligationId').selectOption('pay1');await field('amount').fill('51');await field('reference').fill('Pago QA');await field('date').fill('2025-01-01');await field('evidence').fill('Evidencia ficticia de pago QA');await commercial.getByRole('button',{name:'Confirmar registro',exact:true}).click();await commercial.getByText('El pago supera el saldo pendiente.',{exact:true}).waitFor();assert.equal(posts.length,3);
 await field('amount').fill('25');await submit();assert.equal(posts.at(-1).body.obligationId,'pay1');assert.equal(posts.at(-1).body.amountMinor,2500);
 console.log('PASS commercial browser: stock receipt, procurement receipt, project obligation and payment, invalid overpayment rejected');
}finally{await browser.close()}

