/**
 * Prueba local Telegram sin llamadas externas, secrets reales ni modificación D1.
 * Node CommonJS; TypeScript se transpila para pruebas de funciones puras y webhooks.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Hono}=require('hono');
function load(file,fakeRequire){
  const source=fs.readFileSync(path.resolve(__dirname,file),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const transpiledModule={exports:{}};
  new Function('require','module','exports',js)(fakeRequire,transpiledModule,transpiledModule.exports);
  return transpiledModule.exports;
}
const agenda=load('../src/telegram-agenda.ts',()=>({}));
const conversation=load('../src/telegram-conversation.ts',()=>({}));
const human=load('../src/telegram-human-contact.ts',()=>({}));
const solar=load('../src/solar-guidance.ts',()=>({}));
const route=load('../src/routes/telegram.ts',(name)=>{
  if(name==='hono')return {Hono};
  if(name==='../middleware')return {
    requireAdminAuth:async(c)=>c.json({error:'not logged in'},401),
    requireStaffAuth:async(c)=>c.json({error:'not logged in'},401),getUser:()=>null
  };
  if(name==='../assistant-engine')return {
    isOutOfScopeMessage:()=>false,isCurrencyQuestion:()=>false,
    generateResponse:()=>({text:'Respuesta comercial'}),loadAssistantContext:()=>({}),detectIntent:()=> 'general',
    OUT_OF_SCOPE_REPLY:'Sin información sobre ese tema.'
  };
  if(name==='../solar-guidance')return {advanceSolarGuidance:()=>({handled:false})};
  if(name==='../exchange-rates')return {getElToqueRates:()=>null,formatExchangeReply:()=>''};
  if(name==='../telegram-agenda')return agenda;
  if(name==='../telegram-conversation')return conversation;
  if(name==='../telegram-human-contact')return human;
  throw Error('Unexpected dependency '+name);
});
async function run(){
 const {extractTelegramMessage,secretMatches,telegramRoutes}=route;
 assert.equal(secretMatches('correct-token-12345','correct-token-12345'),true);
 assert.equal(secretMatches('correct-token-12346','correct-token-12345'),false);
 assert.equal(secretMatches('','correct-token-12345'),false);
 const payload={update_id:1201,message:{
   from:{id:535001,first_name:'Cliente'},chat:{id:535001,type:'private'},text:'asesoramiento solar'
 }};
 assert.deepEqual(extractTelegramMessage(payload),{
   updateId:'1201',chatId:'535001',text:'asesoramiento solar',firstName:'Cliente'
 });
 assert.equal(extractTelegramMessage({...payload,message:{...payload.message,chat:{id:-1001,type:'supergroup'}}}),null);
 assert.equal(extractTelegramMessage({...payload,message:{...payload.message,from:{id:1234}}}),null);
 assert.equal(extractTelegramMessage({...payload,message:{...payload.message,from:{id:535001,is_bot:true}}}),null);
 assert.equal(extractTelegramMessage({...payload,update_id:1.4}),null);
 assert.equal(extractTelegramMessage({...payload,message:{...payload.message,text:undefined}}),null);
 let response=await telegramRoutes.request('http://local/webhook',{method:'POST',body:'{}'},{});
 assert.equal(response.status,503,'bot must be disabled without credentials');
 response=await telegramRoutes.request('http://local/webhook',{
   method:'POST',headers:{'x-telegram-bot-api-secret-token':'wrong'},
   body:JSON.stringify(payload)
 },{TELEGRAM_WEBHOOK_SECRET:'valid-secret-123456789',TELEGRAM_BOT_TOKEN:'fake'});
 assert.equal(response.status,401,'spoofed webhook rejected');
 response=await telegramRoutes.request('http://local/webhook',{
   method:'POST',headers:{'x-telegram-bot-api-secret-token':'valid-secret-123456789'},
   body:JSON.stringify({...payload,message:{...payload.message,chat:{type:'group',id:-12345}}})
 },{TELEGRAM_WEBHOOK_SECRET:'valid-secret-123456789',TELEGRAM_BOT_TOKEN:'fake'});
 assert.equal(response.status,200,'group messages ignored without touching D1');
 response=await telegramRoutes.request('http://local/admin/link',{},{
   TELEGRAM_WEBHOOK_SECRET:'valid-secret-123456789',TELEGRAM_BOT_TOKEN:'fake'
 });
 assert.equal(response.status,401,'staff APIs require verified session');
 assert.equal(agenda.cubaHour(new Date('2026-07-15T11:00:00Z')),7);
 assert.equal(agenda.cubaHour(new Date('2026-12-15T12:00:00Z')),7);
 assert.equal(agenda.cubaHour(new Date('2026-07-15T12:00:00Z')),8);
 assert.equal(agenda.cubaTomorrow(new Date('2026-03-07T18:00:00Z')),'2026-03-08');
 assert.equal(agenda.cubaTomorrow(new Date('2026-11-01T18:00:00Z')),'2026-11-02');

 // Conversación natural; no necesita comandos /hoy o /pendientes.
 const act=conversation.classifyTelegramMessage;
 assert.equal(act('¿Qué trabajos tenemos mañana?'),'agenda-tomorrow');
 assert.equal(act('Muéstrame las citas de hoy'),'agenda-today');
 assert.equal(act('¿Cuántas solicitudes tenemos pendientes?'),'pending');
 assert.equal(act('¿Cuántas solicitudes faltan?'),'pending');
 assert.equal(act('Quiero reservar una cita mañana'),null,
   'Una solicitud de cita NO debe confundirse con consultar la agenda del equipo');
 assert.equal(act('Activa mis recordatorios de las 7'),'reminders-enable');
 assert.equal(act('✅ Activar avisos diarios'),'reminders-enable',
   'El botón debe ejecutar la misma acción que una petición conversacional');
 assert.equal(act('🔕 Desactivar avisos'),'reminders-disable');
 assert.equal(act('Desactiva los avisos diarios'),'reminders-disable');
 assert.equal(act('¿Cómo activo el recordatorio de las 7?'),'reminders-info');
 assert.equal(act('¿Me puedes recordar las citas?'),'reminders-info',
   'Consultar si existen recordatorios no debe activar consentimiento');
 assert.equal(act('Necesito un sistema solar'),'solar');
 assert.equal(act('☀️ Asesoría solar'),'solar');
 assert.equal(act('🛍️ Ver productos'),'products');
 assert.equal(act('🧾 Solicitar servicio'),'request-service');
 assert.equal(act('🙋 Hablar con una persona'),'human');
 assert.equal(act('Quiero hablar con un gestor'),'human');
 assert.equal(act('WhatsApp de los gestores'),'human');
 assert.equal(act('Soy del equipo'),'link-help');
 assert.equal(act('✏️ Nuevo chat'),'new-chat');

 const client=conversation.telegramReplyKeyboard(false);
 const staff=conversation.telegramReplyKeyboard(true);
 const flatten=k=>JSON.stringify(k);
 assert.match(flatten(client),/Asesoría solar/);
 assert.doesNotMatch(flatten(client),/Agenda del equipo|Solicitudes pendientes|Recordatorios/,
   'Las sugerencias del personal no se ofrecen a chats no verificados');
 assert.match(flatten(staff),/Agenda del equipo hoy/);
 assert.match(flatten(staff),/Solicitudes pendientes/);
 assert.match(flatten(conversation.telegramReplyKeyboard(false,'essential')),/Solo esenciales/);
 const conversationalSolar=conversation.presentTelegramReply(
   '¿Ya tienes inversor?\n\n1. No\n2. Sí\n\nResponde 1 o 2.','ownership');
 assert.doesNotMatch(conversationalSolar,/Responde 1 o 2|1\. No|2\. Sí/);
 assert.match(conversationalSolar,/Puedes tocar una opción/);
 assert.equal(conversation.telegramReplyKeyboard(false,'simple-loads').remove_keyboard,true);
 const stage=solar.advanceSolarGuidance('Solo esenciales',{
   stage:'essential',level:'basico',simpleLoads:[{
     name:'Refrigerador',watts:150,hours:8,units:1,critical:true,duty:0.4
   }]
 });
 assert.equal(stage.handled,true);
 assert.equal(stage.state?.stage,'backup');
 assert.equal(stage.state?.onlyCritical,true);

 // Verificar estructura REAL enviada a Bot API sin red ni token real.
 const previousFetch=global.fetch;
 let outgoing;
 try{
   global.fetch=async(url,options)=>{
     outgoing={url,body:JSON.parse(options.body)};
     return {ok:true,json:async()=>({ok:true})};
   };
   await route.sendTelegramText({TELEGRAM_BOT_TOKEN:'TEST_NO_REAL'},'535001','Hola',client);
 }finally{global.fetch=previousFetch;}
 assert.equal(outgoing.body.chat_id,'535001');
 assert.equal(outgoing.body.reply_markup.keyboard[0][0].text,'☀️ Asesoría solar');
 assert.equal(outgoing.body.link_preview_options.is_disabled,true);
 console.log('PASS telegram bot smoke: webhook security, Cuban time, natural chat, role-aware buttons, solar choices');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
