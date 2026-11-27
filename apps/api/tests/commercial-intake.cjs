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


// Reproduce the reported conversation: menu, free text, multiple labelled fields,
// no repeated generic guidance, explicit confirmation only.
d=null;
assert.equal(say('🏢 Empresas y negocios').draft.stage,'need');
let natural=say('respaldo solar y somos de Boyeros');
assert.equal(natural.draft.need,'respaldo solar');
assert.equal(natural.draft.location,'Boyeros');
assert.equal(natural.draft.stage,'kind');
assert.equal(say('privada').draft.stage,'company');
assert.equal(say('La entidad es Trinity, la persona de contacto es María').draft.company,'Trinity');
assert.equal(d.contact,'María');
assert.equal(d.stage,'payment');
assert.equal(say('transferencia').draft.stage,'budget');
assert.equal(say('por definir').draft.stage,'review');
assert.equal(say('confirmar solicitud comercial').submit,true);
assert.equal(d.kind,'empresa_privada');
assert.match(say('corregir ubicación: La Habana').reply,/La Habana/);
assert.equal(d.location,'La Habana');
assert.equal(advance('¿Qué productos venden?',null,'q'),null);
console.log('PASS natural business intake, multi-field extraction, explicit correction and consent');

d=null;
assert.equal(say('solicitar servicio').draft.stage,'need');
say('Necesito reparar el inversor y estamos en Boyeros');
assert.equal(say('vivienda').draft.kind,'persona');
say('Nombre: Ana Pérez; contacto: Ana');
say('Forma de pago: transferencia; moneda: CUP; presupuesto: 2500 USD');
assert.equal(d.currency,'CUP');assert.equal(d.budget,'2500');assert.equal(d.stage,'review');
assert.equal(say('enviar solicitud').submit,true);
d={...d,stage:'submitted'};assert.match(say('confirmar solicitud').reply,/case-test/);
d=null;assert.equal(say('quiero ser proveedor').draft.stage,'need');assert.equal(d.kind,'otro');
assert.equal(say('cancelar borrador').draft,null);
console.log('PASS residential and supplier journeys, payment currency, confirmation aliases');
