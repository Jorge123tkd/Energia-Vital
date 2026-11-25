import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../public/studio-engineering/app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
test('project menu has one actual action per destination',()=>{
 const context={arg:JSON.stringify,menu:items=>items};vm.createContext(context);
 const items=vm.runInContext(extract('function projectMenu(p)','\nfunction projectCard')+'\nprojectMenu({id:"p1"})',context);
 assert.equal(new Set(items.map(x=>x[1])).size,items.length);
 assert.equal(items.filter(x=>x[1].includes("'export'")).length,1);
 assert.equal(items.filter(x=>x[1].includes("'projectBackup'")).length,1);
 assert.equal(items.some(x=>x[1]==='openProject("p1")'),false);
});
test('company creation and delivery are on company detail; backups remain private',()=>{
 const cards=extract('function companyList()','\nfunction showCompany');
 assert.doesNotMatch(cards,/companyExportDialog|projectDialog\(|backupCompany\(/);
 const detail=extract('function companyView()','\nfunction addContact');
 assert.match(detail,/companyExportDialog/);assert.match(detail,/backupCompany/);
 const delivery=extract('function exportProfiles(p)','\n\nfunction canSeeFinance');
 assert.equal((delivery.match(/supplierDialog\(\)/g)||[]).length,1);
 assert.doesNotMatch(delivery,/internalZip\(/);
 const backup=extract('function projectBackup()','\nasync function restoreFile');
 assert.match(backup,/internalZip\(/);assert.match(backup,/nav\('backups'\)/);assert.doesNotMatch(backup,/restoreFile\(/);
});
test('one RFQ chooser retains format-specific review and actual output handlers',()=>{
 const rfq=extract("function supplierDialog(mode='choose')",'\nfunction supplierPrintable');
 assert.match(rfq,/name="format"/);assert.match(rfq,/supplierExcelPreview\(selected,opts,rows\)/);
 assert.match(rfq,/!f\.has\('review'\)/);assert.match(rfq,/openPrintable\(html\)/);
 assert.match(rfq,/zip\(\{'index.html':html\}\)/);
 assert.match(source,/function supplierExcelDialog\(\)\{return supplierDialog\('xlsx'\)\}/);
});
test('ZIP share is offered only when it is not another download',()=>{
 assert.match(source,/function supportsZipShare\(\)/);
 assert.match(source,/supportsZipShare\(\)\?B\('Compartir ZIP'/);
});
test('online settings describe actual central storage, not local SQLite or ZIP updater',()=>{
 assert.match(source,/function settings\(\)\{if\(globalThis\.EVEngineeringStore\)/);
 assert.match(source,/Actualizaciones|actualizaciones se publican desde Bonaire/);
});

test('managed sessions retain identity and preferences without local browser storage',()=>{
 assert.match(source,/EVEngineeringAccount\.info\(\)/);
 assert.match(source,/function engineeringCanLeave\(\).*pendingSave\(\)/);
 assert.match(source,/centralAccountAction\('logout'\)/);
 assert.match(source,/snap\.__evStudioPrefs=\{autoSaveEnabled,defaults:centralDefaults\}/);
 assert.match(source,/centralDefaults=raw\?\.__evStudioPrefs/);
 assert.match(source,/async function init\(\)\{if\(globalThis\.EVEngineeringStore\)/);
});

// Compare vendored assets to the recorded Git blob IDs, not just file names.
test('Bonaire ships the recorded EV Pro engineering assets without drift',()=>{
 const dir=new URL('../public/studio-engineering/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('source-version.json',dir),'utf8'));
 assert.equal(manifest.repository,'Jorge123tkd/EV-Pro-Estudio');
 assert.match(manifest.commit,/^[a-f0-9]{40}$/);
 for(const file of ['app.js','engine.js','library.js','style.css','favicon.svg','updater.js']){
  const bytes=readFileSync(new URL(file,dir));
  const hash=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  assert.equal(hash,manifest.files[file], 'Engineering asset diverged: '+file);
 }
 // index.html is deliberately adapted to the sandboxed Bonaire bridge.
 const html=readFileSync(new URL('index.html',dir),'utf8');
 assert.match(html,/connect-src 'none'/);
 assert.ok(html.indexOf('src="bridge.js?')>=0 && html.indexOf('src="bridge.js?')<html.indexOf('src="app.js?'));
});
