import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
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
 assert.match(source,/function settings\(\)\{if\(globalThis\.EVEngineeringStore\?\.scope==='online'\)/);
 assert.match(source,/Actualizaciones|actualizaciones se publican desde Bonaire/);
});
