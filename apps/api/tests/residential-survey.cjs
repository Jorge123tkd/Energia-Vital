const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/residential-survey.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
const {validateSurvey,surveyQuote}=m.exports;
const material={name:'Panel solar',kind:'material',unit:'unit',required_milli:8000,client_milli:5000,warehouse_milli:2000,sale_cents:10000};
const labor={name:'Montaje de panel',kind:'labor',unit:'unit',required_milli:8000,client_milli:0,warehouse_milli:0,sale_cents:1500};
const input={mode:'partial',site:'Boyeros',notes:'Visita',lines:[material,labor]};
const s=validateSurvey(input);assert.ok(s);const q=surveyQuote(s,1);assert.equal(q.items[0].quantity,3);assert.equal(q.items[1].quantity,8);assert.match(q.planningNotes,/proveedor 1/);assert.doesNotMatch(q.stockNotes,/proveedor|almacén/i);assert.equal(q.canImport,true);
assert.equal(validateSurvey({...input,mode:'turnkey'}),null);
assert.equal(validateSurvey({...input,mode:'installation'}),null);
assert.equal(validateSurvey({...input,lines:[{...material,warehouse_milli:4000}]}),null);
assert.equal(validateSurvey({...input,lines:[{...labor,client_milli:1000}]}),null);
assert.equal(surveyQuote(validateSurvey({...input,lines:[{...material,sale_cents:null}]}),1).canImport,false);
assert.equal(surveyQuote(validateSurvey({...input,mode:'installation',lines:[{...material,client_milli:8000,warehouse_milli:0,sale_cents:null},labor]}),1).items.length,1);
console.log('PASS residential: partial supply, labor independent, installation-only, invalid allocation and missing price');

assert.ok(validateSurvey({...input,lines:[{...material,sale_cents:250000000}]}));
assert.equal(validateSurvey({...input,lines:[{...material,sale_cents:100000000000}]}),null);
