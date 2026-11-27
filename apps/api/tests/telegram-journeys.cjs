/** Run real Telegram decisions with a synthetic, ownership-aware D1 double. No network or production. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name==='../middleware')return {requireAdminAuth:async c=>c.json({},401),requireStaffAuth:async c=>c.json({},401),getUser:()=>null};
  if(name==='../telegram-customer-documents')return {telegramDocuments:async()=>null};
  if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));
  return require(name);
 },module,module.exports);
 return module.exports;
}
const {decide,canonicalTelegramLinks,sendTelegramText}=load(path.join(__dirname,'../src/routes/telegram.ts'));
const requests=new Map(),intakes=new Map(),appointments=new Map();
let linked=false,customerId='qa-customer',update=100,commercial=null,appointment=null;
const env={ENVIRONMENT:'production',DB:{
 prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this},
 async all(){if(sql.includes('FROM customers WHERE telegram_customer_chat_id'))return {results:linked?[{id:customerId,name:'Cliente QA'}]:[]};return {results:[]}},
 async first(){if(sql.includes('FROM requests r JOIN request_intake'))return requests.get(this.args[0])?.owner===null&&requests.get(this.args[0])?.args[2]===this.args[1]?{id:this.args[0]}:null;if(sql.includes('FROM telegram_staff_links'))return null;if(sql.includes('FROM customers WHERE id='))return linked?{id:customerId,name:'Cliente QA'}:null;if(sql.includes('FROM requests r JOIN customers'))return requests.get(this.args[0])?.owner===customerId?{id:this.args[0]}:null;if(sql.includes('FROM appointments a JOIN customers'))return appointments.has(this.args[0])?{id:this.args[0]}:null;return null},
 async run(){if(sql.includes('INSERT INTO appointments')){assert.equal(this.args[5],customerId);appointments.set(this.args[0],this.args);return {meta:{changes:1}}}throw Error('Unexpected write '+sql)}}},
 async batch(stmts){for(const s of stmts){if(s.sql.includes('INSERT INTO requests')&&s.sql.includes('VALUES (?,NULL')){assert.equal(linked,false);if(!requests.has(s.args[0]))requests.set(s.args[0],{owner:null,args:s.args})}else if(s.sql.includes('INSERT INTO requests')){assert.equal(s.args[6],customerId);assert.equal(s.args[7],'555001');if(!requests.has(s.args[0]))requests.set(s.args[0],{owner:customerId,args:s.args})}else if(s.sql.includes('INSERT INTO request_intake'))intakes.set(s.args[0],s.args);else throw Error('Unexpected batch '+s.sql)}return stmts.map(()=>({meta:{changes:1}}))}
}};
async function say(text){const r=await decide(env,'555001',text,null,'qa-thread',commercial,String(update++),appointment);if(r.commercial!==undefined)commercial=r.commercial;if(r.appointment!==undefined)appointment=r.appointment;return r}
(async()=>{
 const retired=[
  'https://energia-vital-web.pages.dev/perfil',
  'http://energiavitalweb.page.dev/entrar',
  'https://energia-vitalweb.pages.net/admin',
  'https://www.energia-vital-web.page.net/telegram-registro.html'
 ];
 for(const old of retired)assert.equal(canonicalTelegramLinks(old),'https://bnergiv.com'+new URL(old).pathname);
 assert.equal(canonicalTelegramLinks('https://wa.me/5351234567'),'https://wa.me/5351234567');
 assert.equal(canonicalTelegramLinks('https://external.example/'),'https://external.example/');
 const previousFetch=global.fetch;let outbound;
 try{
  global.fetch=async(url,options)=>{outbound={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({ok:true})}};
  await sendTelegramText({ENVIRONMENT:'production',TELEGRAM_BOT_TOKEN:'TEST_NO_REAL'},'555001',
   'Abre tu perfil: https://energiavitalweb.page.net/perfil',
   {inline_keyboard:[[{text:'Perfil',url:'https://energia-vital-web.pages.dev/perfil'}],[{text:'Registro',web_app:{url:'https://energia-vitalweb.page.dev/telegram-registro.html'}}]]});
 }finally{global.fetch=previousFetch}
 assert.match(outbound.body.text,/https:\/\/bnergiv\.com\/perfil/);
 assert.equal(outbound.body.reply_markup.inline_keyboard[0][0].url,'https://bnergiv.com/perfil');
 assert.equal(outbound.body.reply_markup.inline_keyboard[1][0].web_app.url,'https://bnergiv.com/telegram-registro.html');

 assert.equal((await say('🏢 Empresas y negocios')).commercial.stage,'need');
 await say('respaldo solar y somos de Boyeros');assert.equal(commercial.stage,'kind');
 await say('privada');await say('Nombre: Empresa QA; contacto: María');await say('Forma de pago: transferencia; moneda: CUP; presupuesto: 2500 USD');
 assert.equal(commercial.stage,'review');assert.equal(requests.size,0);assert.equal(intakes.size,0);
 const id=commercial.id;const pending=await say('confirmar solicitud comercial');assert.match(pending.reply,/crea o vincula/i);assert.equal(commercial.id,id);assert.equal(requests.size,0);
 linked=true;assert.match((await say('confirmar solicitud comercial')).reply,/Solicitud registrada/);assert.equal(requests.size,1);assert.equal(intakes.get(id)[1],250000);assert.equal(intakes.get(id)[3],'CUP');
 assert.match((await say('confirmar solicitud comercial')).reply,/ya está registrada/);assert.equal(requests.size,1);

 // The full natural answer is parsed once; the next response is the review, not another field prompt.
 commercial=null;linked=false;const requestsBeforeFull=requests.size;
 await say('Empresas y negocios');
 await say('respaldo solar y somos de Boyeros');
 const fullAnswer=await say('Privada. Somos una MIPYME llamada Empresa Onair. Persona de contacto: María Pérez. Necesitamos un sistema de respaldo solar para nuestras oficinas. Pagamos por transferencia en CUP y tenemos 5000 USD de presupuesto.');
 assert.equal(commercial.stage,'review');
 assert.equal(commercial.company,'Empresa Onair');
 assert.equal(commercial.contact,'María Pérez');
 assert.equal(commercial.need,'un sistema de respaldo solar para nuestras oficinas');
 assert.equal(commercial.location,'Boyeros');
 assert.equal(commercial.payment,'transferencia');
 assert.equal(commercial.currency,'CUP');
 assert.equal(commercial.budget,'5000');
 assert.match(fullAnswer.reply,/confirmar solicitud comercial/);
 assert.doesNotMatch(fullAnswer.reply,/¿Cuál es el nombre|¿Qué presupuesto|¿Cómo prevén pagar|¿En qué municipio/);
 assert.equal(requests.size,requestsBeforeFull,'No request before explicit confirmation and identity/phone choice');
 const fullChoice=await say('confirmar solicitud comercial');
 assert.match(JSON.stringify(fullChoice.replyMarkup),/Dejar número de WhatsApp/);
 assert.equal(requests.size,requestsBeforeFull);

 commercial=null;linked=true;await say('solicitar servicio');await say('Necesito reparar el inversor y estamos en Plaza');await say('vivienda');await say('Ana Pérez');await say('efectivo');await say('por definir');
 assert.equal(commercial.kind,'persona');assert.equal(commercial.stage,'review');await say('cancelar borrador');assert.equal(commercial,null);assert.equal(requests.size,1);
 await say('quiero ser proveedor');assert.equal(commercial.kind,'otro');await say('cancelar borrador');
 await say('solicitar cita');await say('mañana');await say('10:00');assert.equal(appointments.size,0);assert.ok(appointment.date&&appointment.time);
 assert.match((await say('confirmar cita')).reply,/Pendiente de aprobación/);assert.equal(appointments.size,1);assert.equal(appointment,null);
 linked=false;commercial=null;
 await say('Empresas y negocios');await say('respaldo solar y somos de Boyeros');await say('estatal');await say('Nombre: Entidad QA');await say('transferencia');await say('por definir');
 const choice=await say('confirmar solicitud comercial');assert.match(JSON.stringify(choice.replyMarkup),/Dejar número de WhatsApp/);assert.equal(requests.size,1);
 await say('dejar número de WhatsApp');assert.equal(commercial.contactMode,'name');await say('María Pérez');assert.equal(commercial.contactMode,'phone');
 await say('123');assert.equal(requests.size,1);const guest=await say('55551234');assert.match(guest.reply,/72 horas/);assert.equal(requests.size,2);assert.equal(commercial.guestSubmitted,true);
 assert.match(requests.get(commercial.id).args[2],/Teléfono: \+5355551234/);assert.equal(requests.get(commercial.id).owner,null);
 await say('confirmar solicitud comercial');assert.equal(requests.size,2);
 console.log('PASS guest contact flow: explicit choice, no account, invalid number and repeat confirmation');
 console.log('PASS real Telegram decision journeys: business, household, supplier, identity gate, duplicate confirmation, cancellation and appointment');
})().catch(e=>{console.error(e);process.exitCode=1});
