'use strict';
const assert=require('node:assert/strict');
const {assess}=require('./release-dependency-audit.cjs');
const report=(critical,high,moderate,low)=>({metadata:{vulnerabilities:{
 critical,high,moderate,low,info:0,total:critical+high+moderate+low}}});
assert.equal(assess(report(0,0,0,3)).ready,true,'Documented low advisories do not block automatically');
assert.equal(assess(report(0,0,1,0)).ready,false);
assert.equal(assess(report(0,1,0,0)).ready,false);
assert.equal(assess(report(1,0,0,0)).ready,false);
assert.throws(()=>assess({error:{code:'ENOAUDIT'}}),/informe válido/);
assert.throws(()=>assess(report(0,0,-1,0)),/inválido/);
console.log('PASS release dependency audit gate rejects critical/high/moderate and invalid reports');
