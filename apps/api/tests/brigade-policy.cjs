const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const source=fs.readFileSync(path.resolve(__dirname,'../src/brigade-policy.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const mod={exports:{}};new Function('module','exports',js)(mod,mod.exports);
const {validCubanWorkDate,cubaToday,decideBrigadeAssignment,recommendBrigade}=mod.exports;
for(const day of ['2026-11-14','2028-02-29','2100-12-31'])assert.equal(validCubanWorkDate(day),true,day);
for(const day of ['2026-02-29','2026-04-31','2026-13-01','mañana','2026-1-1',null])
  assert.equal(validCubanWorkDate(day),false,String(day));
assert.equal(cubaToday(new Date('2026-11-14T02:00:00.000Z')),'2026-11-13',
  'La fecha de Cuba no debe adelantarse a medianoche UTC');
assert.equal(decideBrigadeAssignment(1,0),'scheduled');
assert.equal(decideBrigadeAssignment(1,1),'acknowledgement_required');
assert.equal(decideBrigadeAssignment(1,1,true),'scheduled');
assert.equal(decideBrigadeAssignment(2,1),'acknowledgement_required');
assert.equal(decideBrigadeAssignment(2,1,true),'scheduled');
assert.equal(decideBrigadeAssignment(3,0),'scheduled');
assert.equal(decideBrigadeAssignment(3,1),'pending_admin_approval');
assert.equal(decideBrigadeAssignment(4,2,true),'pending_admin_approval',
  'El reconocimiento del gestor NO sustituye al administrador con más de dos brigadas');
assert.throws(()=>decideBrigadeAssignment(0,1));
assert.throws(()=>decideBrigadeAssignment(2,-1));
const items=[
 {id:'brigada1',name:'Brigada 1',active:true,day_jobs:1,planned_minutes:90,jobs_in_period:1},
 {id:'brigada2',name:'Brigada 2',active:true,day_jobs:0,planned_minutes:480,jobs_in_period:1}
];
assert.equal(recommendBrigade(items),'brigada2','Priorizar disponible en el día');
assert.equal(recommendBrigade(items.map(x=>({...x,day_jobs:0}))),'brigada1',
  'Con igual disponibilidad, priorizar menor carga estimada');
assert.equal(recommendBrigade(items.map(x=>({...x,active:false}))),null);
console.log('PASS brigade-policy: jornada Cuba, 1/2/3+ brigadas y distribución equitativa');
