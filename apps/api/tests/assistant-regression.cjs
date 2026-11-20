/**
 * Regresión focalizada: conversación real de Bonaire, moneda y plural de cargas.
 * Solo requiere TypeScript ya instalado; NO toca D1 ni llama a elTOQUE.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(rel){
  const src=fs.readFileSync(path.resolve(__dirname,'../src',rel),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',js)(()=>({}),module,module.exports);
  return module.exports;
}
const {detectIntent,generateResponse,isCurrencyQuestion,isOutOfScopeMessage,OUT_OF_SCOPE_REPLY,buildSystemPrompt}=load('assistant-engine.ts');
const {advanceSolarGuidance,parseLoads}=load('solar-guidance.ts');
const {parseElToquePayload,formatExchangeReply}=load('exchange-rates.ts');

const ctx={config:{},faq:[],categories:[{name:'Paneles Solares'}],
  products:[{name:'Panel 550 W',price:145,currency:'USD',stock_status:'on_order'}],services:[]};
assert.equal(detectIntent('Precio del dólar'),'currency_exchange');
assert.equal(detectIntent('¿A cuánto está el euro hoy?'),'currency_exchange');
assert.equal(detectIntent('Cuánto cuestan los paneles en USD'),'price_inquiry');
assert.equal(isCurrencyQuestion('Precio de inversor en dólares'),false);
assert.equal(detectIntent('¿y el euro?'),'currency_exchange');
assert.equal(detectIntent('¿y el dólar?'),'currency_exchange');
assert.equal(detectIntent('¡y el euro!'),'currency_exchange');
assert.equal(isCurrencyQuestion('y el euro'),true);
assert.equal(detectIntent('Dólar a euro'),'currency_exchange');
const exchange=generateResponse('Precio del dolar',ctx);
assert.equal(exchange.intent,'currency_exchange');
assert.doesNotMatch(exchange.text,/Panel 550|cotizar equipos/);
assert.match(exchange.text,/elTOQUE/i);

const crisis=generateResponse('Saber de la crisis mundial',ctx);
assert.equal(crisis.text,OUT_OF_SCOPE_REPLY);
assert.match(crisis.text,/Bonaire/);
assert.match(crisis.text,/paneles solares/);
assert.doesNotMatch(crisis.text,/inflaci[oó]n|conflictos internacionales/i);
assert.equal(isOutOfScopeMessage('Saber de la crisis mundial'),true);
assert.equal(isOutOfScopeMessage('¿Qué paneles solares aguantan los apagones?'),false);
assert.equal(isOutOfScopeMessage('¿Cómo afecta la crisis de electricidad a mis baterías solares?'),false);
const crisisAfterCurrency=generateResponse('Saber de la crisis mundial',ctx,
  [{role:'user',content:'Precio del dólar'},{role:'assistant',content:'No tengo tasas recientes'}]);
assert.equal(crisisAfterCurrency.intent,'general','Nuevo tema general no hereda precio del dólar');
assert.equal(crisisAfterCurrency.text,OUT_OF_SCOPE_REPLY);
assert.match(buildSystemPrompt(ctx),/responde SOLO consultas relacionadas/);

const loads=parseLoads('1 televisor, 1 refrigerador, 2 aires acondicionados, 5 luces led, 1 computadora');
assert.equal(loads.length,5);
assert.equal(loads.find(l=>l.name==='Aire acondicionado').units,2);
assert.equal(parseLoads('2 airas acondicionados')[0].units,2);
assert.equal(loads.reduce((sum,l)=>sum+l.watts*l.units,0),2840);

function turn(text,state){
 const r=advanceSolarGuidance(text,state);
 assert.equal(r.handled,true,text+' must be handled');
 return r;
}
let r=turn('Dame un asesoramiento solar',null);
assert.equal(r.state.stage,'ownership');
r=turn('no',r.state);
assert.equal(r.state.stage,'sector');
r=turn('1',r.state);
r=turn('1',r.state);
r=turn('1 televisor, 1 refrigerador, 2 aires acondicionados, 5 luces led, 1 computadora',r.state);
assert.equal(r.state.simpleLoads.length,5);
assert.match(r.reply,/2 × Aire acondicionado/);
r=turn('2',r.state);
assert.equal(r.state.stage,'backup');
r=turn('10',r.state);
assert.equal(r.state,null);
assert.match(r.reply,/2 × Aire acondicionado/);
assert.match(r.reply,/2840 W/);
assert.match(r.reply,/ATENCI[OÓ]N/);
assert.doesNotMatch(r.reply,/440 W/);

r=turn('asesor solar',null);
r=turn('1',r.state);r=turn('1',r.state);r=turn('1',r.state);
const unknown=turn('1 refrigerador, 2 equipos misteriosos',r.state);
assert.equal(unknown.state.stage,'simple-loads');
assert.match(unknown.reply,/No reconoc[ií]/);
assert.match(unknown.reply,/equipos misteriosos/);
const joined=turn('2 aires acondicionados y 1 refrigerador',r.state);
assert.equal(joined.state.stage,'simple-loads');
assert.match(joined.reply,/No reconoc[ií]/);

assert.equal(parseElToquePayload(null),null);
assert.equal(parseElToquePayload({tasas:{USD:400,ECU:450,MLC:310},date:'2026-11-12',hour:8,minutes:15}).eur,450);
const reply=formatExchangeReply({usd:400,eur:450,mlc:310,reportedAt:'2026-11-12 08:15'});
assert.match(reply,/1 USD =/);
assert.match(reply,/1 EUR =/);
assert.match(reply,/1 MLC =/);
assert.match(reply,/no una cotización directa/i);
assert.doesNotMatch(formatExchangeReply(null),/1 USD = [0-9]/);
console.log('PASS assistant regression: business-only scope, currency exception, 2 ACs, truthful rates, unknown loads');

// Propuestas B2B no se confunden con compra, asesoría o solicitudes de servicio.
const businessCases = [
 'Quiero ser su proveedor',
 'Somos fabricantes de baterías y queremos que Bonaire sea nuestro distribuidor en Cuba',
 'Queremos que promocionen nuestra marca de alimentos',
 'Me interesa una asociación comercial con Bonaire',
 'Queremos hacer negocios con ustedes',
 'Buscamos distribuidores en Cuba',
 'Ofrecemos productos a Bonaire',
];
for (const message of businessCases) {
 assert.equal(detectIntent(message),'business_proposal',message);
 const answer=generateResponse(message,ctx);
 assert.equal(answer.intent,'business_proposal');
 assert.match(answer.text,/país/);
 assert.match(answer.text,/no confirma un acuerdo/i);
 assert.doesNotMatch(answer.text,/qué inversor|cuántas baterías/i);
}
for (const message of ['Necesito asesoramiento solar','¿Qué servicios ofrecen?',
 'Quiero comprar un inversor para mi mipyme','¿Qué es un distribuidor?',
 'Soy una empresa estatal y necesito saber cuánto consume un aire',
 'No quiero ser proveedor, necesito asesoramiento']) {
 assert.notEqual(detectIntent(message),'business_proposal',message);
 assert.doesNotMatch(generateResponse(message,ctx).text,/qué empresa representas/i);
}
const first=generateResponse('Queremos que distribuyan nuestros productos',ctx);
const commercialHistory=[{role:'user',content:'Queremos que distribuyan nuestros productos'},
 {role:'assistant',content:first.text}];
const follow=generateResponse('Somos Ejemplo SA, de España, fabricamos paneles solares',ctx,commercialHistory);
assert.equal(follow.intent,'business_proposal');
assert.match(follow.text,/Ejemplo SA/);
assert.match(follow.text,/no se ha enviado/i);
assert.match(follow.text,/contacto#contacto-comercial/);
assert.notEqual(generateResponse('¿Cuánto cuesta un inversor?',ctx,commercialHistory).intent,'business_proposal');
assert.notEqual(generateResponse('Necesito asesoramiento solar',ctx,commercialHistory).intent,'business_proposal');
assert.match(generateResponse('Cancelar',ctx,commercialHistory).text,/dejamos la propuesta/i);
assert.match(buildSystemPrompt(ctx),/No preguntes el tipo de cliente/);
console.log('PASS commercial proposals: suppliers, promotion, distribution, partnerships, follow-up and advice separation');
