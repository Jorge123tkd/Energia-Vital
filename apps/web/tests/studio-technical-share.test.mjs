import test from 'node:test';
import assert from 'node:assert/strict';
import {savedProjects,previewTechnicalRows} from '../src/lib/studio-technical-share.js';
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
