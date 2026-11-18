const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache={};
function load(name){
 if(cache[name])return cache[name];
 const src=fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(id=>load(id.replace(/^\.\//,'')),mod,mod.exports);
 return cache[name]=mod.exports;
}
const {advanceCommercialIntake:advance}=load('commercial-intake');
let d=null;
function say(message){const result=advance(message,d,'case-test');if(result)d=result.draft;return result;}
assert.equal(say('¿Qué venden?'),null);
assert.equal(say('Registrar solicitud comercial').draft.stage,'kind');
assert.equal(say('mipyme').draft.stage,'company');
assert.equal(say('Empresa ficticia').draft.stage,'need');
assert.equal(say('Proyecto de respaldo industrial').draft.stage,'location');
assert.equal(say('La Habana').draft.stage,'payment');
assert.equal(say('transferencia').draft.stage,'budget');
assert.equal(say('1000 CUP').draft.stage,'budget');
assert.equal(say('2500.50').draft.stage,'review');
assert.equal(say('sí').submit,undefined);
assert.equal(say('¿confirmar solicitud comercial?').submit,undefined);
assert.equal(say('confirmar solicitud comercial').submit,true);
d={...d,stage:'submitted'};
assert.equal(say('confirmar solicitud comercial').submit,undefined);
assert.match(say('confirmar solicitud comercial').reply,/case-test/);
d=null;say('Registrar solicitud comercial');
assert.equal(say('cancelar borrador').draft,null);
assert.equal(advance('confirmar solicitud comercial',null,'new'),null);
console.log('PASS commercial intake: explicit confirmation, cancellation, USD validation, repeated confirmation');
