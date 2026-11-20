/** Phase A: simulated commercial conversations without Cloudflare or private data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(relative){
 const source=fs.readFileSync(path.join(__dirname,'../src',relative),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',js)((id)=>{
   if(id==='./solar-guidance')return {};
   throw Error('Unexpected runtime import: '+id);
 },module,module.exports);
 return module.exports;
}
const engine=load('assistant-engine.ts');
const telegram=load('telegram-conversation.ts');
const serviceCases=[
 ['Soy una mipyme y necesitamos mantenimiento de refrigeradores','mipyme'],
 ['Somos una empresa estatal y necesitamos un proyecto eléctrico','empresa estatal'],
 ['Soy un negocio privado y quiero contratar reparación de equipos','negocio'],
 ['Represento una cooperativa, queremos solicitar mantenimiento','cooperativa'],
 ['Soy una empresa estatal, necesito una instalación trifásica','empresa estatal'],
 ['Somos una mipyme, queremos cotización para oficina','mipyme'],
];
for(const [query,kind] of serviceCases){
 const answer=engine.businessServiceReply(query);
 assert.ok(answer && answer.includes('Atención empresarial'),query);
 assert.ok(answer.toLowerCase().includes(kind),query);
 assert.ok(!/dime (?:cuantos?|qué) paneles/i.test(answer),query);
 assert.ok(answer.includes('no crea una solicitud'),query);
}
const first=engine.businessServiceReply(serviceCases[0][0]);
const follow=engine.businessServiceReply('Trabajamos en La Habana y podemos pagar por transferencia',
  [{role:'user',content:serviceCases[0][0]},{role:'assistant',content:first}]);
assert.ok(follow&&follow.includes('USD')&&follow.includes('NO un expediente'));
assert.equal(engine.businessServiceReply('¿Qué venden?'),null);
assert.equal(engine.businessServiceReply('Somos una empresa, ¿qué productos venden?'),null);
assert.equal(engine.businessServiceReply('Soy una empresa y quiero saber qué equipos venden'),null);
assert.ok(engine.businessServiceReply('Somos una empresa estatal').includes('Atención empresarial'));
assert.equal(engine.businessServiceReply('Quiero instalar paneles en mi casa'),null);
assert.equal(engine.businessServiceReply('No queremos asociarnos con Bonaire'),null);
assert.equal(engine.businessServiceReply('¿Cómo está el dólar?'),null);
assert.equal(engine.businessServiceReply('Cuánto cuesta un inversor'),null);
assert.equal(engine.businessServiceReply('asesoramiento solar',[{role:'assistant',content:first}]),null);
assert.equal(engine.businessServiceReply('cancelar',[{role:'assistant',content:first}]).includes('dejamos'),true);
for(const query of ['Quiero ser proveedor de Bonaire','Quiero distribuir sus productos en Cuba','Somos fabricantes y queremos que nos representen']){
 assert.ok(engine.businessProposalReply(query),query);
 assert.equal(engine.businessServiceReply(query),null);
}
assert.equal(telegram.classifyTelegramMessage('🏢 Empresas y negocios'),'business-services');
assert.equal(telegram.classifyTelegramMessage('🤝 Proveedores y alianzas'),'business-partner');
assert.equal(telegram.classifyTelegramMessage('¿Qué productos tienen?'),'products');
assert.equal(telegram.classifyTelegramMessage('Necesito asesoramiento solar'),'solar');
assert.equal(telegram.classifyTelegramMessage('Quiero reservar una cita mañana'),null);
assert.equal(telegram.classifyTelegramMessage('Agenda del equipo hoy'),'agenda-today');
const keyboard=telegram.telegramReplyKeyboard(false,null);
assert.ok(keyboard.keyboard.flat().some(x=>x.text.includes('Empresas y negocios')));
assert.ok(keyboard.keyboard.flat().some(x=>x.text.includes('Proveedores y alianzas')));
console.log('PASS 23 enterprise inquiry, supplier, residential and Telegram routing checks');
