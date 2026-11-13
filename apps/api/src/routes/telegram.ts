/**
 * Bonaire — Telegram Bot API. Sin bot token ni webhook secret el canal permanece inactivo.
 * Un chat de Telegram no equivale a un usuario registrado en Bonaire.
 * Privilegios internos únicamente después de vinculación OTP desde /admin autenticado.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAdminAuth,requireStaffAuth,getUser } from '../middleware';
import {
  generateResponse,loadAssistantContext,detectIntent,isOutOfScopeMessage,
  OUT_OF_SCOPE_REPLY,isCurrencyQuestion
} from '../assistant-engine';
import { advanceSolarGuidance,type SolarState } from '../solar-guidance';
import { getElToqueRates,formatExchangeReply } from '../exchange-rates';
import { agendaForTeam,pendingTicketSummary } from '../telegram-agenda';
import { classifyTelegramMessage,telegramReplyKeyboard,presentTelegramReply,type TelegramReplyMarkup } from '../telegram-conversation';

export const telegramRoutes = new Hono<{ Bindings:Env; Variables:{user?:any} }>();
const now=()=>new Date().toISOString();
const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const encoder=new TextEncoder();
const validChatId=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const validUpdateId=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;

export function secretMatches(supplied:string|null,expected:string):boolean{
  if(!supplied||supplied.length!==expected.length)return false;
  let mismatches=0;
  for(let i=0;i<supplied.length;i++)mismatches|=supplied.charCodeAt(i)^expected.charCodeAt(i);
  return mismatches===0;
}
export function extractTelegramMessage(payload:any):{updateId:string;chatId:string;text:string;firstName:string}|null{
  if(!payload||!validUpdateId(payload.update_id))return null;
  const msg=payload.message;
  if(!msg||msg.chat?.type!=='private'||!validChatId(msg.chat.id)||
    !validChatId(msg.from?.id)||msg.from.id!==msg.chat.id||msg.from.is_bot===true)return null;
  if(typeof msg.text!=='string')return null;
  const text=msg.text.trim();
  if(!text)return null;
  return {
    updateId:String(payload.update_id),chatId:String(msg.chat.id),
    text:text.slice(0,4000),
    firstName:typeof msg.from.first_name==='string'?msg.from.first_name.slice(0,60):'cliente'
  };
}
export async function sendTelegramText(
  env:Env,chatId:string,text:string,replyMarkup?:TelegramReplyMarkup
):Promise<void>{
  if(!env.TELEGRAM_BOT_TOKEN)throw Error('Bot Telegram no configurado');
  const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:text.slice(0,3900),
      link_preview_options:{is_disabled:true},reply_markup:replyMarkup}),
    signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)throw Error('Telegram no aceptó el mensaje ('+response.status+')');
  const reply:unknown=await response.json();
  if(!reply||typeof reply!=='object'||(reply as {ok?:unknown}).ok!==true)
    throw Error('Telegram no confirmó el envío del mensaje');
}
async function linkHash(env:Env,code:string):Promise<string>{
  // Token del bot como clave HMAC: el código no se almacena en D1 en texto claro.
  if(!env.TELEGRAM_BOT_TOKEN)throw Error('Telegram no configurado');
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.TELEGRAM_BOT_TOKEN),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const raw=await crypto.subtle.sign('HMAC',key,encoder.encode('staff-telegram-link:'+code));
  return Array.from(new Uint8Array(raw)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function currentTelegramStaff(env:Env,chatId:string):
  Promise<{id:string;email:string;role:string;reminders_enabled:number}|null>{
  return env.DB.prepare(
    "SELECT a.id,a.email,a.role,l.reminders_enabled FROM telegram_staff_links l "+
    "JOIN admin_users a ON a.id=l.admin_user_id "+
    "WHERE l.chat_id=? AND a.is_active=1 AND a.role IN ('admin','operator')"
  ).bind(chatId).first<{id:string;email:string;role:string;reminders_enabled:number}>();
}
async function redeemCode(env:Env,chatId:string,code:string):Promise<string>{
  const time=now();
  const record=await env.DB.prepare(
    'SELECT attempts,window_start FROM telegram_staff_link_attempts WHERE chat_id=?'
  ).bind(chatId).first<{attempts:number;window_start:string}>();
  const recent=!!record && Date.now()-Date.parse(record.window_start)<15*60*1000;
  if(recent&&record!.attempts>=5)return 'Demasiados intentos. Prueba más tarde o solicita otro código en /admin.';
  await env.DB.prepare(
    'INSERT INTO telegram_staff_link_attempts (chat_id,attempts,window_start) VALUES (?,?,?) '+
    'ON CONFLICT(chat_id) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start'
  ).bind(chatId,recent?record!.attempts+1:1,recent?record!.window_start:time).run();
  const hashed=await linkHash(env,code);
  const approved=await env.DB.prepare(
    "SELECT c.admin_user_id FROM telegram_staff_link_codes c JOIN admin_users a ON a.id=c.admin_user_id "+
    "WHERE c.code_hash=? AND c.expires_at>? AND a.is_active=1 AND a.role IN ('admin','operator')"
  ).bind(hashed,time).first<{admin_user_id:string}>();
  if(!approved)return 'Código inválido o vencido. Inicia sesión en /admin y genera otro.';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telegram_staff_links WHERE chat_id=? OR admin_user_id=?')
      .bind(chatId,approved.admin_user_id),
    env.DB.prepare(
      'INSERT INTO telegram_staff_links (chat_id,admin_user_id,verified_at,reminders_enabled) '+
      'VALUES (?,?,?,0)'
    ).bind(chatId,approved.admin_user_id,time),
    env.DB.prepare('DELETE FROM telegram_staff_link_codes WHERE admin_user_id=?')
      .bind(approved.admin_user_id),
    env.DB.prepare('DELETE FROM telegram_staff_link_attempts WHERE chat_id=?').bind(chatId)
  ]);
  return '¡Listo! Tu Telegram está vinculado de forma segura con tu cuenta del equipo Bonaire.\n\n'+
    'Ahora puedes preguntarme de forma natural: «¿Qué trabajos tenemos hoy?», '+
    '«Muéstrame las citas de mañana» o «¿Cuántas solicitudes siguen pendientes?».\n\n'+
    'Los avisos automáticos de las 7:00 están DESACTIVADOS por defecto; puedes pedirme activarlos.';
}
type Session={chat_id:string;thread_id:string;solar_context:string;window_start:string|null;window_count:number};
type BotDecision={
  reply:string;state?:SolarState|null;newThread?:boolean;skipHistory?:boolean;
  keyboardView?:'reminders';
};
async function decide(env:Env,chatId:string,raw:string,state:SolarState|null,threadId:string):Promise<BotDecision>{
  const text=raw.trim();
  // Un empleado obtiene su código desde /admin y lo escribe AQUÍ sin comandos.
  // Por compatibilidad seguimos admitiendo /vincular 12345678.
  const linkCode=text.match(/^(?:\/?vincular\s+|codigo\s+|mi codigo es\s+)?(\d{8})$/i);
  if(linkCode)return {reply:await redeemCode(env,chatId,linkCode[1]),skipHistory:true};
  const action=classifyTelegramMessage(text);
  const staff=await currentTelegramStaff(env,chatId);
  const site=env.SITE_URL?.startsWith('https://')?env.SITE_URL:'https://energia-vital-web.pages.dev';

  switch(action){
    case 'welcome':
      return {reply:'¡Hola! ☀️ Soy el asistente de Bonaire. Cuéntame con tus palabras qué necesitas.\n\n'+
        'Puedo ayudarte a elegir un inversor, calcular baterías, consultar equipos del catálogo '+
        'y conocer nuestros servicios. También puedes tocar una de las opciones que aparecen abajo.\n\n'+
        (staff?'Como parte del equipo, también puedes preguntarme por la agenda de hoy, mañana o las solicitudes pendientes.':
          'Si trabajas en Bonaire, puedes vincular tu cuenta de personal de manera segura desde /admin.')};
    case 'help':
      return {reply:'Hablemos de forma natural, como con un asesor de Bonaire. 😊\n\n'+
        'Por ejemplo, puedes decirme «Necesito energía para mi nevera y dos aires acondicionados», '+
        '«Quiero saber qué inversores venden» o «Necesito una reparación».\n\n'+
        (staff?'También puedes preguntar «¿Qué trabajos hay mañana?», «¿Cuántas solicitudes faltan?» '+
          'o «¿Cómo activo el recordatorio de las 7?».':
          'Para compras, solicitudes y datos de tu cuenta, entra en la web de Bonaire: '+site)};
    case 'new-chat':
      return {reply:'Empezamos otra conversación. ¿Qué te gustaría resolver hoy en Bonaire? ☀️',
        state:null,newThread:true,skipHistory:true};
    case 'erase-history':{
      await env.DB.prepare('DELETE FROM telegram_bot_messages WHERE chat_id=?').bind(chatId).run();
      return {reply:'Eliminé los mensajes que Bonaire guardaba de este chat. '+
        'Los mensajes que aparecen en tu aplicación Telegram debes borrarlos desde Telegram. '+
        '¿Con qué empezamos ahora?',state:null,newThread:true,skipHistory:true};
    }
    case 'history':{
      const rows=await env.DB.prepare(
        "SELECT substr(content,1,120) AS content FROM telegram_bot_messages "+
        "WHERE chat_id=? AND thread_id=? AND role='user' ORDER BY created_at DESC LIMIT 5"
      ).bind(chatId,threadId).all<{content:string}>();
      const topics=(rows.results||[]).reverse();
      return {reply:topics.length?'Esto es lo último que me contaste en esta conversación:\n'+
        topics.map((x,i)=>(i+1)+'. '+x.content).join('\n')+
        '\n\n¿Quieres continuar con alguno de estos temas?':
        'Todavía no tenemos mensajes anteriores en esta conversación. '+
        'El historial privado de tu cuenta web se mantiene separado.',
        skipHistory:true};
    }
    case 'link-help':
      return {reply:staff
        ?'Tu Telegram ya está vinculado al equipo Bonaire. Puedes consultar agenda y solicitudes con preguntas normales.'
        :'Si formas parte del equipo, entra con tu usuario autorizado a /admin → Mi cuenta → Vincular Telegram de equipo. '+
         'Allí genera un código temporal. Luego escríbeme aquí SOLO los ocho números del código; '+
         'no necesitas aprender comandos ni compartir tu contraseña.',skipHistory:true};
    case 'unlink':
      if(!staff)return {reply:'Este Telegram no está vinculado con una cuenta de personal.',skipHistory:true};
      await env.DB.prepare('DELETE FROM telegram_staff_links WHERE chat_id=? AND admin_user_id=?')
        .bind(chatId,staff.id).run();
      return {reply:'Listo: tu Telegram quedó desvinculado del equipo y ya no tiene acceso '+
        'a citas o solicitudes internas. Para volver a vincularlo, genera un nuevo código en /admin.',
        skipHistory:true};
    case 'agenda-today':
    case 'agenda-tomorrow':
      if(!staff)return {reply:'La agenda interna de Bonaire es privada. Si trabajas en nuestro equipo, '+
        'vincula tu cuenta de /admin para consultarla. Si eres cliente y deseas pedir una cita, '+
        'puedo orientarte sobre cómo solicitarla desde la web.',skipHistory:true};
      return {reply:await agendaForTeam(env,action==='agenda-today'?'today':'tomorrow'),skipHistory:true};
    case 'pending':
      if(!staff)return {reply:'El listado de solicitudes internas pertenece al personal autorizado. '+
        'Si necesitas presentar una solicitud, puedes hacerlo desde tu cuenta en '+site,
        skipHistory:true};
      return {reply:await pendingTicketSummary(env),skipHistory:true};
    case 'reminders-enable':
    case 'reminders-disable':
      if(!staff)return {reply:'Los recordatorios del equipo necesitan una cuenta de personal vinculada. '+
        'Si trabajas en Bonaire, inicia sesión en /admin para vincular tu Telegram.',skipHistory:true};
      await env.DB.prepare('UPDATE telegram_staff_links SET reminders_enabled=? WHERE chat_id=? AND admin_user_id=?')
        .bind(action==='reminders-enable'?1:0,chatId,staff.id).run();
      return {reply:action==='reminders-enable'
        ?'He activado tus resúmenes diarios de la agenda GENERAL del equipo para las 7:00 a. m., hora de Cuba. '+
         'No son asignaciones personales ni confirmaciones de los clientes. Cuando quieras, dime «desactiva los avisos diarios».'
        :'He desactivado tus avisos diarios. Puedes seguir preguntándome por la agenda cuando lo necesites.',
        skipHistory:true};
    case 'reminders-info':
      if(!staff)return {reply:'Los avisos diarios son exclusivos del personal vinculado de Bonaire. '+
        'Para acceder, vincula Telegram desde una sesión de /admin.',skipHistory:true};
      return {reply:'Tus recordatorios de las 7:00 a. m. (hora de Cuba) están '+
        (staff.reminders_enabled?'ACTIVADOS':'DESACTIVADOS')+'.\n\n'+
        '¿Quieres cambiarlo? Puedes pulsar «Activar avisos diarios» o «Desactivar avisos» debajo, '+
        'o simplemente decírmelo.',keyboardView:'reminders',skipHistory:true};
    case 'solar':{
      const guided=advanceSolarGuidance('asesoramiento solar',null);
      return {reply:guided.reply,state:guided.state};
    }
    case 'products':{
      const context=await loadAssistantContext(env.DB);
      return {reply:generateResponse('¿Qué productos solares tienen disponibles?',context).text,state:null};
    }
    case 'services':{
      const context=await loadAssistantContext(env.DB);
      return {reply:generateResponse('¿Qué servicios ofrecen?',context).text,state:null};
    }
    case 'request-service':
      return {reply:'Claro. ¿Necesitas instalación, mantenimiento, reparación o una evaluación solar? '+
        'Cuéntame qué equipo tienes y en qué municipio de Cuba sería el trabajo.\n\n'+
        'Para que la solicitud quede registrada y podamos darle seguimiento, '+
        'puedes enviarla desde tu cuenta en Bonaire: '+site+
        '\nNo programaré una visita sin una solicitud confirmada.',state:null};
    case 'human':
      return {reply:'Te ayudo a contactar a una persona del equipo Bonaire. '+
        'En la sección Contacto de nuestra web encontrarás los canales comerciales configurados: '+
        site+'\n\nSi me cuentas brevemente tu consulta, también puedo orientarte por aquí.',state:null};
  }

  if(isOutOfScopeMessage(text))return {reply:OUT_OF_SCOPE_REPLY};
  if(isCurrencyQuestion(text))return {reply:formatExchangeReply(await getElToqueRates(env.ELTOQUE_API_TOKEN))};
  if(detectIntent(text)==='telegram'){
    return {reply:'Ya estás conversando conmigo aquí en Telegram. Puedes escribirme con libertad '+
      'sobre los equipos y servicios de Bonaire. El WhatsApp de la empresa sigue atendido por gestores humanos.'};
  }

  const solar=advanceSolarGuidance(text,state);
  if(solar.handled)return {reply:solar.reply,state:solar.state};
  const context=await loadAssistantContext(env.DB);
  const history=await env.DB.prepare(
    "SELECT role,content FROM telegram_bot_messages WHERE chat_id=? AND thread_id=? "+
    "ORDER BY created_at DESC LIMIT 12"
  ).bind(chatId,threadId).all<{role:string;content:string}>();
  return {reply:generateResponse(text,context,(history.results||[]).reverse()).text};
}
async function claimUpdate(env:Env,updateId:string,chatId:string):Promise<boolean>{
  const time=now();
  const accepted=await env.DB.prepare(
    "INSERT OR IGNORE INTO telegram_bot_updates (update_id,chat_id,status,created_at,updated_at) "+
    "VALUES (?,?,'processing',?,?)"
  ).bind(updateId,chatId,time,time).run();
  if(accepted.meta?.changes)return true;
  const old=new Date(Date.now()-2*60*1000).toISOString();
  const retried=await env.DB.prepare(
    "UPDATE telegram_bot_updates SET status='processing',updated_at=? "+
    "WHERE update_id=? AND chat_id=? AND (status='failed' OR (status='processing' AND updated_at<?))"
  ).bind(time,updateId,chatId,old).run();
  return Boolean(retried.meta?.changes);
}
async function processUpdate(env:Env,input:NonNullable<ReturnType<typeof extractTelegramMessage>>):Promise<void>{
  if(!await claimUpdate(env,input.updateId,input.chatId))return;
  try {
    const time=now();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO telegram_bot_sessions "+
      "(chat_id,thread_id,solar_context,window_start,window_count,created_at,updated_at) "+
      "VALUES (?,?, 'null',NULL,0,?,?)"
    ).bind(input.chatId,crypto.randomUUID(),time,time).run();
    const session=await env.DB.prepare(
      'SELECT chat_id,thread_id,solar_context,window_start,window_count FROM telegram_bot_sessions WHERE chat_id=?'
    ).bind(input.chatId).first<Session>();
    if(!session)throw Error('Sesión de Telegram no disponible');
    const current=Date.now()-Date.parse(session.window_start||'')<3600000;
    const count=(current?session.window_count:0)+1;
    if(count>45){
      if(count===46)await sendTelegramText(env,input.chatId,
        'Alcanzaste el límite temporal de consultas de Bonaire. Vuelve a escribir más tarde.');
      await env.DB.batch([
        env.DB.prepare('UPDATE telegram_bot_sessions SET window_start=?,window_count=?,updated_at=? WHERE chat_id=?')
          .bind(current?session.window_start:time,count,time,input.chatId),
        env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?")
          .bind(time,input.updateId)
      ]);
      return;
    }
    let state:SolarState|null=null;
    try{state=JSON.parse(session.solar_context) as SolarState|null;}catch{/* recuperar estado vacío */}
    const decision=await decide(env,input.chatId,input.text,state,session.thread_id);
    const nextThread=decision.newThread?crypto.randomUUID():session.thread_id;
    const nextState=decision.newThread?null:decision.state===undefined?state:decision.state;
    // Refrescar el vínculo después de procesar el mensaje: el OTP puede haberlo creado
    // o «desvincular» puede haberlo revocado en esta misma interacción.
    const currentStaff=await currentTelegramStaff(env,input.chatId);
    const keyboard=telegramReplyKeyboard(Boolean(currentStaff),nextState?.stage,decision.keyboardView||'normal');
    const renderedReply=presentTelegramReply(decision.reply,nextState?.stage);
    await sendTelegramText(env,input.chatId,renderedReply,keyboard);
    const audit=decision.skipHistory?[]:[
      env.DB.prepare(
        "INSERT INTO telegram_bot_messages (id,chat_id,thread_id,role,content,created_at) VALUES (?,?,?,'user',?,?)"
      ).bind(crypto.randomUUID(),input.chatId,nextThread,input.text,time),
      env.DB.prepare(
        "INSERT INTO telegram_bot_messages (id,chat_id,thread_id,role,content,created_at) VALUES (?,?,?,'assistant',?,?)"
      ).bind(crypto.randomUUID(),input.chatId,nextThread,renderedReply,time)
    ];
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE telegram_bot_sessions SET thread_id=?,solar_context=?,window_start=?,window_count=?,updated_at=? WHERE chat_id=?'
      ).bind(nextThread,JSON.stringify(nextState),current?session.window_start:time,count,time,input.chatId),
      ...audit,
      env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?")
        .bind(time,input.updateId)
    ]);
  }catch(e){
    console.error('Error al procesar update de Telegram',input.updateId,
      e instanceof Error?e.message:'Error desconocido');
    await env.DB.prepare("UPDATE telegram_bot_updates SET status='failed',updated_at=? WHERE update_id=?")
      .bind(now(),input.updateId).run().catch(()=>null);
    throw e;
  }
}
telegramRoutes.post('/webhook',async c=>{
  const env=c.env;
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET||env.TELEGRAM_WEBHOOK_SECRET.length<16)
    return c.json({error:'Telegram no configurado'},503);
  if(!secretMatches(c.req.header('x-telegram-bot-api-secret-token')||null,env.TELEGRAM_WEBHOOK_SECRET))
    return c.json({error:'Webhook no autorizado'},401);
  if(Number(c.req.header('content-length')||'0')>64000)return c.text('Payload grande',413);
  const raw=await c.req.text();
  if(encoder.encode(raw).byteLength>64000)return c.text('Payload grande',413);
  let body:unknown;
  try{body=JSON.parse(raw);}catch{return c.json({error:'JSON inválido'},400);}
  const message=extractTelegramMessage(body);
  if(!message)return c.json({ok:true});
  try{await processUpdate(env,message);return c.json({ok:true});}
  catch{return c.json({error:'Falló la entrega; Telegram puede reintentar'},503);}
});

// Solo administradores pueden configurar el webhook y consultar la configuración del bot.
telegramRoutes.post('/set-webhook',requireAdminAuth,async c=>{
  if(!c.env.TELEGRAM_BOT_TOKEN||!c.env.TELEGRAM_WEBHOOK_SECRET)
    return c.json({error:'Configura los secretos de Telegram'},503);
  if(!/^[A-Za-z0-9_-]{16,256}$/.test(c.env.TELEGRAM_WEBHOOK_SECRET))
    return c.json({error:'El secreto del webhook debe tener 16-256 caracteres A-Z, 0-9, _ o -'},400);
  // URL fija del Worker. No aceptar URL arbitraria proporcionada por un cliente.
  const callback='https://energia-vital-api.astrustrus.workers.dev/api/telegram/webhook';
  const res=await fetch('https://api.telegram.org/bot'+c.env.TELEGRAM_BOT_TOKEN+'/setWebhook',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({url:callback,secret_token:c.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates:['message'],max_connections:1}),
    signal:AbortSignal.timeout(9000)
  });
  if(!res.ok)return c.json({error:'No se pudo registrar webhook con Telegram.'},502);
  const result:any=await res.json();
  return c.json({ok:result.ok===true,description:result.description||''},result.ok===true?200:502);
});
telegramRoutes.get('/webhook-info',requireAdminAuth,async c=>{
  if(!c.env.TELEGRAM_BOT_TOKEN)return c.json({error:'Telegram no configurado'},503);
  const res=await fetch('https://api.telegram.org/bot'+c.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo',{
    signal:AbortSignal.timeout(9000)
  });
  if(!res.ok)return c.json({error:'No se pudo consultar Telegram'},502);
  return c.json(await res.json());
});
telegramRoutes.get('/admin/link',requireStaffAuth,async c=>{
  if(!c.env.TELEGRAM_BOT_TOKEN||!c.env.TELEGRAM_WEBHOOK_SECRET)
    return c.json({configured:false,linked:false,reminders_enabled:false});
  const user=getUser(c)!;
  const linked=await c.env.DB.prepare(
    'SELECT verified_at,reminders_enabled FROM telegram_staff_links WHERE admin_user_id=?'
  ).bind(user.user_id).first<{verified_at:string;reminders_enabled:number}>();
  return c.json({configured:true,linked:!!linked,verified_at:linked?.verified_at||null,
    reminders_enabled:Boolean(linked?.reminders_enabled)});
});
telegramRoutes.post('/admin/link-code',requireStaffAuth,async c=>{
  if(!c.env.TELEGRAM_BOT_TOKEN||!c.env.TELEGRAM_WEBHOOK_SECRET)
    return c.json({error:'Telegram no configurado. Prepara primero BotFather y los secretos del Worker.'},503);
  const user=getUser(c)!;
  const time=now();
  const prior=await c.env.DB.prepare(
    'SELECT created_at FROM telegram_staff_link_codes WHERE admin_user_id=?'
  ).bind(user.user_id).first<{created_at:string}>();
  if(prior&&Date.now()-Date.parse(prior.created_at)<60*1000)
    return c.json({error:'Espera un minuto antes de generar otro código.'},429);
  const random=crypto.getRandomValues(new Uint32Array(1))[0];
  const code=String(random%100000000).padStart(8,'0');
  const hashed=await linkHash(c.env,code);
  const until=new Date(Date.now()+10*60*1000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM telegram_staff_link_codes WHERE admin_user_id=?').bind(user.user_id),
    c.env.DB.prepare('INSERT INTO telegram_staff_link_codes (code_hash,admin_user_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(hashed,user.user_id,until,time)
  ]);
  return c.json({code,expires_at:until,instruction:'Abre el chat privado con el bot de Bonaire y envía solo estos ocho dígitos: '+code});
});
telegramRoutes.delete('/admin/link',requireStaffAuth,async c=>{
  const user=getUser(c)!;
  if(!c.env.TELEGRAM_BOT_TOKEN||!c.env.TELEGRAM_WEBHOOK_SECRET)
    return c.json({configured:false,linked:false});
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM telegram_staff_links WHERE admin_user_id=?').bind(user.user_id),
    c.env.DB.prepare('DELETE FROM telegram_staff_link_codes WHERE admin_user_id=?').bind(user.user_id)
  ]);
  return c.json({linked:false,message:'Telegram desvinculado de tu cuenta de personal.'});
});
