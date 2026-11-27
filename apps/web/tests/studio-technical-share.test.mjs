import test from 'node:test';
import assert from 'node:assert/strict';
import {savedProjects,previewTechnicalRows,reviewTeamChanges,applyTeamChanges} from '../src/lib/studio-technical-share.js';
const manifest={projects:[{id:'p1',name:'Proyecto original',budget:{cost:9999},sites:[{id:'site1',name:'Sede',tasks:[{name:'Colocar soportes',end:'2026-12-01',status:'Pendiente',owner:'private-person',note:'private-note'}],materials:[{id:'m1',name:'Panel',unit:'ud',qty:12,cost:9321,supplier:'secret-supplier',catalogId:'legacy-id',data:'private-photo'}],privateFinance:{profit:100}}]}]};
test('engineering share exposes only typed technical fields, preserves source project id',async()=>{
 assert.deepEqual(savedProjects(manifest),[{id:'p1',name:'Proyecto original'}]);
 const a=await previewTechnicalRows(manifest,'p1');
 assert.equal(a.rows.length,2);
 assert.deepEqual(a.rows[0].body,{title:'Colocar soportes',status:'pending',dueDate:'2026-12-01'});
 assert.deepEqual(a.rows[1].body,{name:'Panel',productId:null,quantity:12,unit:'unit'});
 assert.match(a.rows[0].id,/^task-[a-f0-9]{64}$/);
 assert.match(a.rows[1].id,/^material-[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(a),/9321|9999|private-person|private-note|secret-supplier|private-photo|legacy-id/);
 assert.deepEqual(a,await previewTechnicalRows(manifest,'p1'));
});
test('unrecognized units, invalid dates and missing IDs are not silently coerced',async()=>{
 const raw=structuredClone(manifest);raw.projects[0].sites[0].tasks[0].end='2026-02-30';raw.projects[0].sites[0].materials[0].unit='unknown';
 const result=await previewTechnicalRows(raw,'p1');assert.equal(result.rows.length,0);assert.equal(result.skipped.length,2);
 await assert.rejects(previewTechnicalRows(raw,'different'));
 assert.throws(()=>savedProjects({projects:[manifest.projects[0],manifest.projects[0]]}));
});

test('reviewed team edits preserve private costs and unrelated engineering fields',async()=>{
 const original=structuredClone(manifest);
 original.projects[0].sites[0].tasks[0].id='task-original';
 const rows=(await previewTechnicalRows(original,'p1')).rows;
 const records=rows.map(r=>({section_id:r.id,revision:2,body:r.kind==='task'?{title:'Soportes instalados',status:'done',dueDate:'2026-12-03'}:{name:'Panel',productId:'other',quantity:18,unit:'unit'}}));
 const pending=await reviewTeamChanges(original,'p1',records);
 assert.equal(pending.changes.length,2);
 const result=await applyTeamChanges(original,'p1',pending.changes);
 const site=result.snapshot.projects[0].sites[0];
 assert.equal(site.tasks[0].name,'Soportes instalados');assert.equal(site.tasks[0].progress,100);
 assert.equal(site.tasks[0].owner,'private-person');assert.equal(site.materials[0].qty,18);
 assert.equal(site.materials[0].cost,9321);assert.equal(site.materials[0].catalogId,'legacy-id');
 assert.deepEqual(site.privateFinance,{profit:100});
 assert.equal(original.projects[0].sites[0].materials[0].qty,12);
 assert.equal((await reviewTeamChanges(result.snapshot,'p1',records)).changes.length,0);
});
test('legacy task rename requires explicit manual identity migration',async()=>{
 const row=(await previewTechnicalRows(manifest,'p1')).rows[0];
 const changes=(await reviewTeamChanges(manifest,'p1',[{section_id:row.id,revision:2,body:{...row.body,title:'Otro nombre'}}])).changes;
 await assert.rejects(applyTeamChanges(manifest,'p1',changes),/heredada/);
});
