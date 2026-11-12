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
const {detectIntent,generateResponse,isCurrencyQuestion}=load('assistant-engine.ts');
const {advanceSolarGuidance,parseLoads}=load('solar-guidance.ts');
const {parseElToquePayload,formatExchangeReply}=load('exchange-rates.ts');

const ctx={config:{},faq:[],categories:[{name:'Paneles Solares'}],
  products:[{name:'Panel 550 W',price:145,currency:'USD',stock_status:'on_order'}],services:[]};
assert.equal(detectIntent('Precio del dólar'),'currency_exchange');
assert.equal(detectIntent('¿A cuánto está el euro hoy?'),'currency_exchange');
assert.equal(detectIntent('Cuánto cuestan los paneles en USD'),'price_inquiry');
assert.equal(isCurrencyQuestion('Precio de inversor en dólares'),false);
const exchange=generateResponse('Precio del dolar',ctx);
assert.equal(exchange.intent,'currency_exchange');
assert.doesNotMatch(exchange.text,/Panel 550|cotizar equipos/);
assert.match(exchange.text,/elTOQUE/i);

const crisis=generateResponse('Saber de la crisis mundial',ctx);
assert.match(crisis.text,/inflaci[oó]n|econom[ií]a/i);
assert.doesNotMatch(crisis.text,/Trabajamos con/);

const loads=parseLoads('1 televisor, 1 refrigerador, 2 aires acondicionados, 5 luces led, 1 computadora');
assert.equal(loads.length,5);
assert.equal(loads.find(l=>l.name==='Aire acondicionado').units,2);
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

assert.equal(parseElToquePayload(null),null);
assert.equal(parseElToquePayload({tasas:{USD:400,ECU:450,MLC:310},date:'2026-11-12',hour:8,minutes:15}).eur,450);
const reply=formatExchangeReply({usd:400,eur:450,mlc:310,reportedAt:'2026-11-12 08:15'});
assert.match(reply,/1 USD =/);
assert.match(reply,/1 EUR =/);
assert.match(reply,/1 MLC =/);
assert.match(reply,/no una cotización directa/i);
assert.doesNotMatch(formatExchangeReply(null),/1 USD = [0-9]/);
console.log('PASS assistant regression: currency routing, general questions, 2 ACs, truthful rates, unknown loads');
