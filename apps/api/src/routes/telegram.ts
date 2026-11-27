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
  businessProposalReply,businessServiceReply,
  OUT_OF_SCOPE_REPLY,isCurrencyQuestion
} from '../assistant-engine';
import { advanceSolarGuidance,type SolarState } from '../solar-guidance';
import { callAI } from '../assistant-ai';
import { getElToqueRates,formatExchangeReply } from '../exchange-rates';
import { agendaForTeam,pendingTicketSummary } from '../telegram-agenda';
import { classifyTelegramMessage,telegramReplyKeyboard,presentTelegramReply,type TelegramReplyMarkup } from '../telegram-conversation';
import { humanWhatsAppReply } from '../telegram-human-contact';
import { currentTelegramCustomer } from '../telegram-customer-auth';
import { SITE_URL, startsRegistration, cancelsRegistration, isCustomerCode, activeRegistration, startRegistration, saveRegistrationStep, cancelRegistration, registrationPrompt, redeemCustomerCode, type Stage } from '../telegram-customer-onboarding';
import { advanceCommercialIntake, startCommercialIntake, naturalCommercialStart, resumeCommercialIntake, recoverLegacyCommercialIntake, type CommercialDraft } from '../commercial-intake';
import { parseRequestIntake } from '../request-intake';
import { requestTelegramAppointment,advanceAppointmentDraft,appointmentDraftReply,type AppointmentDraft } from '../telegram-customer-appointments';
import { setTelegramCustomerNotifications } from '../telegram-customer-notifications';
import { issuedCustomerQuotes } from '../customer-quotes';
import { extractTelegramPhoto, receiveTelegramPhoto } from '../telegram-customer-photos';
import { extractTelegramDocument, receiveTelegramDocument, telegramDocuments } from '../telegram-customer-documents';

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
export function extractTelegramMessage(payload:any):{updateId:string;chatId:string;text:string;firstName:string;lastName:string;username:string|null;messageId?:number}|null{
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
    firstName:typeof msg.from.first_name==='string'?msg.from.first_name.slice(0,60):'',
    lastName:typeof msg.from.last_name==='string'?msg.from.last_name.slice(0,60):'',
    username:typeof msg.from.username==='string'&&/^[A-Za-z0-9_]{1,64}$/.test(msg.from.username)?msg.from.username:null,
    ...(validUpdateId(msg.message_id)?{messageId:msg.message_id}:{})
  };
}
export function extractTelegramAccountCallback(payload:any):{id:string;input:NonNullable<ReturnType<typeof extractTelegramMessage>>}|null{
  const q=payload?.callback_query;
  if(!q||!['customer:create','customer:contact'].includes(q.data)||typeof q.id!=='string'||q.id.length>128||!validUpdateId(payload.update_id)||q.message?.chat?.type!=='private'||!validChatId(q.from?.id)||q.from.id!==q.message.chat.id||q.from.is_bot===true)return null;
  const input=extractTelegramMessage({update_id:payload.update_id,message:{chat:q.message.chat,from:q.from,text:q.data==='customer:contact'?'dejar número de WhatsApp':'crear cuenta'}});
  return input?{id:q.id,input}:null;
}
async function acknowledgeCallback(env:Env,id:string){
  try{await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/answerCallbackQuery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:id}),signal:AbortSignal.timeout(5000)});}catch{/* No sensitive logs. */}
}
function siteForBot(env:Env){return env.ENVIRONMENT==='qa'?(env.SITE_URL||'').replace(/\/+$/,''):SITE_URL;}
/** Rewrite only known retired Bonaire web hosts, never Telegram/WhatsApp/API URLs. */
export function canonicalTelegramLinks(value:string,site='https://bnergiv.com'):string{
 return value.replace(/https?:\/\/(?:energia-vital-web|energiavitalweb|energia-vitalweb)\.(?:pages\.dev|pages\.net|page\.dev|page\.net)(?=[/?#\s"'<>),!]|$|\.(?=\s|$))/gi,()=>site);
}
function canonicalMarkup(markup:TelegramReplyMarkup|undefined,site:string):TelegramReplyMarkup|undefined{
 if(!markup||!('inline_keyboard' in markup))return markup;
 return {inline_keyboard:markup.inline_keyboard.map(row=>row.map(button=>'url' in button?{...button,url:canonicalTelegramLinks(button.url,site)}:'web_app' in button?{...button,web_app:{url:canonicalTelegramLinks(button.web_app.url,site)}}:button))};
}
function accountChoices(site:string):TelegramReplyMarkup{
  return {inline_keyboard:[[{text:'Crear cuenta',callback_data:'customer:create'}],[{text:'Vincular cuenta',url:site+'/perfil'}]]};
}
function commercialContactChoices(site:string):TelegramReplyMarkup{
 return {inline_keyboard:[[{text:'Dejar número de WhatsApp',callback_data:'customer:contact'}],[{text:'Crear cuenta',callback_data:'customer:create'}],[{text:'Vincular cuenta',url:site+'/perfil'}]]};
}
export function normalizeContactPhone(text:string):string|null{
 const raw=text.trim();
 if(!/^\+?[0-9 ()-]{8,25}$/.test(raw))return null;
 let digits=raw.replace(/\D/g,'');
 // Only infer the Cuban country code for an unprefixed eight-digit number.
 if(!raw.startsWith('+')&&digits.length===8)digits='53'+digits;
 if(!/^[1-9]\d{7,14}$/.test(digits)||(!raw.startsWith('+')&&digits.length!==10)||(!raw.startsWith('+')&&!digits.startsWith('53')))return null;
 return '+'+digits;
}
function cleanContactName(value:string|undefined):string|null{
 const name=(value||'').trim().replace(/\s+/g,' ');
 return name.length>=3&&name.length<=120&&/\p{L}/u.test(name)?name:null;
}
async function saveGuestCommercial(env:Env,d:CommercialDraft,phone:string):Promise<boolean>{
 const name=cleanContactName(d.contact);
 if(!name||d.stage!=='review'||!d.company||!d.need||!d.location||!d.kind||d.payment===undefined||d.budget===undefined)return false;
 const intake=parseRequestIntake({customer_type:d.kind,available_budget_usd:d.budget,payment_method:d.payment,payment_currency:d.currency});
 if(intake.error||!intake.value)return false;
 const title=('Solicitud comercial: '+d.company).slice(0,180);
 const description='[Contacto por WhatsApp - sin cuenta]\nNombre: '+name+'\nTeléfono: '+phone+'\n\n[Origen: Telegram]\nEntidad: '+d.company+'\nNecesidad: '+d.need;
 const time=now();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO requests (id,customer_id,type,request_category_id,title,description,status,priority,location,preferred_date,created_at,updated_at) VALUES (?,NULL,'consultation','consultation',?,?,'pending','medium',?,NULL,?,?) ON CONFLICT(id) DO NOTHING").bind(d.id,title,description,d.location,time,time),
  env.DB.prepare("INSERT INTO request_intake(request_id,available_budget_usd_cents,payment_method,payment_currency,customer_type,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM requests WHERE id=? AND customer_id IS NULL AND description=?) ON CONFLICT(request_id) DO NOTHING").bind(d.id,intake.value.available_budget_usd_cents,intake.value.payment_method,intake.value.payment_currency,intake.value.customer_type,time,time,d.id,description)
 ]);
 const saved=await env.DB.prepare("SELECT r.id FROM requests r JOIN request_intake i ON i.request_id=r.id WHERE r.id=? AND r.customer_id IS NULL AND r.description=?").bind(d.id,description).first();
 return !!saved;
}
function registrationDecision(stage:Stage,site:string,invalid=false):BotDecision{
  const reply=(invalid&&stage!=='password'?'No pude validar ese dato. Inténtalo otra vez.\n\n':'')+registrationPrompt(stage);
  return {reply,skipHistory:true,state:null,replyMarkup:stage==='password'?{inline_keyboard:[[{text:'Establecer contraseña',web_app:{url:site+'/telegram-registro.html?mode=finish'}}]]}:{remove_keyboard:true}};
}
async function removeUnexpectedPasswordMessage(env:Env,chatId:string,messageId:number|undefined){
  if(messageId===undefined)return;
  try{await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/deleteMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,message_id:messageId}),signal:AbortSignal.timeout(5000)});}catch{/* Best effort only; not a confidentiality guarantee. */}
}
export async function sendTelegramText(
  env:Env,chatId:string,text:string,replyMarkup?:TelegramReplyMarkup
):Promise<void>{
  if(!env.TELEGRAM_BOT_TOKEN)throw Error('Bot Telegram no configurado');
  const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:canonicalTelegramLinks(text,siteForBot(env)).slice(0,3900),
      link_preview_options:{is_disabled:true},reply_markup:canonicalMarkup(replyMarkup,siteForBot(env))}),
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
  reply:string;state?:SolarState|null;commercial?:CommercialDraft|null;appointment?:AppointmentDraft|null;newThread?:boolean;skipHistory?:boolean;
  keyboardView?:'reminders';replyMarkup?:TelegramReplyMarkup;
};
export async function decide(env:Env,chatId:string,raw:string,state:SolarState|null,threadId:string,prior:CommercialDraft|null,updateId:string,appointment:AppointmentDraft|null=null):Promise<BotDecision>{
  const text=raw.trim();
  // Un empleado obtiene su código desde /admin y lo escribe AQUÍ sin comandos.
  // Por compatibilidad seguimos admitiendo /vincular 12345678.
  const linkCode=text.match(/^(?:\/?vincular\s+|codigo\s+|mi codigo es\s+)(\d{8})$/i);
  if(linkCode)return {reply:await redeemCode(env,chatId,linkCode[1]),skipHistory:true};
  // Compatibilidad con códigos de personal sin prefijo, excepto durante un trámite comercial.
  if(!prior && /^\d{8}$/.test(text))return {reply:await redeemCode(env,chatId,text),skipHistory:true};
  const action=classifyTelegramMessage(text);
  const staff=await currentTelegramStaff(env,chatId);
  const site=siteForBot(env);

  const customer=await currentTelegramCustomer(env,chatId);
  const accountButton=accountChoices(site);
  const contactButton=commercialContactChoices(site);
  if(/^(?:vincular cuenta|vincular cuenta existente|vincular cuenta de cliente)$/i.test(text))return {reply:'Entra en tu cuenta web, abre Mi perfil → Vincular Telegram, genera un código y envíamelo aquí. No compartas tu contraseña.',replyMarkup:{inline_keyboard:[[{text:'Abrir mi perfil',url:site+'/perfil'}]]},skipHistory:true};
  if(action==='customer-account')return customer
    ?{reply:'Tu cuenta Bonaire ya está vinculada, '+customer.name+'. Puedes entrar a la web con tu correo y contraseña o seguir aquí.',skipHistory:true}
    :{reply:'Si todavía no tienes cuenta, pulsa Crear cuenta y te haré las preguntas aquí. Si ya tienes una, pulsa Vincular cuenta: entra a Mi perfil, genera un código y envíamelo aquí. Nunca escribas tu contraseña en el chat.',replyMarkup:accountButton,skipHistory:true};
  if(/^(?:mis cotizaciones|mis presupuestos|ver cotizaciones|📄 mis cotizaciones)$/i.test(text)){
    if(!customer)return {reply:'Para consultar cotizaciones privadas, vincula tu cuenta de cliente.',replyMarkup:accountButton,skipHistory:true};
    const quotes=await issuedCustomerQuotes(env,customer.id);
    return {reply:quotes.length?'Cotizaciones emitidas para tu cuenta:\n\n'+quotes.slice(0,8).map(q=>q.title+'\nUSD '+(q.total_cents/100).toFixed(2)+' · Vigencia: '+q.valid_until+'\nReferencia: '+q.id).join('\n\n'):'Todavía no tienes cotizaciones emitidas por Bonaire.',skipHistory:true};
  }
  if(/^(?:activar notificaciones de cliente|desactivar notificaciones de cliente|configurar notificaciones|🔔 configurar notificaciones)$/i.test(text)){
    if(!customer)return {reply:'Vincula primero tu cuenta de cliente.',replyMarkup:accountButton,skipHistory:true};
    if(/^activar/i.test(text)||/^desactivar/i.test(text)){
      const enabled=/^activar/i.test(text);
      const saved=await setTelegramCustomerNotifications(env,customer.id,chatId,enabled);
      return {reply:saved?(enabled?'Avisos automáticos activados. Recibirás avisos de nuevas notificaciones, sin información privada en el mensaje. Para desactivarlos escribe «desactivar notificaciones de cliente».':'Avisos automáticos desactivados. Puedes consultar tu bandeja cuando quieras.'):'No se pudo cambiar la preferencia.',skipHistory:true};
    }
    const preference=await env.DB.prepare("SELECT telegram_notifications_since FROM customers WHERE id=? AND telegram_customer_chat_id=?").bind(customer.id,chatId).first<{telegram_notifications_since:string|null}>();
    return {reply:'Avisos automáticos: '+(preference?.telegram_notifications_since?'activados':'desactivados')+'. Escribe «activar notificaciones de cliente» para recibir avisos nuevos o «desactivar notificaciones de cliente» para dejar de recibirlos.',skipHistory:true};
  }
  if(/^(?:mis notificaciones|mis novedades|mis avisos de cliente|🔔 mis notificaciones)$/i.test(text)){
    if(!customer)return {reply:'Vincula tu cuenta para consultar tus notificaciones privadas.',replyMarkup:accountButton,skipHistory:true};
    const {results}=await env.DB.prepare(
      "SELECT n.title,n.message,n.created_at FROM notifications n JOIN customers c ON c.id=n.user_id WHERE n.user_id=? AND n.user_type='customer' AND c.telegram_customer_chat_id=? AND c.is_active=1 ORDER BY n.created_at DESC,n.id DESC LIMIT 5"
    ).bind(customer.id,chatId).all<{title:string;message:string;created_at:string}>();
    return {reply:results?.length?'Tus últimas notificaciones:\n\n'+results.map(n=>n.title+'\n'+n.message.slice(0,500)+'\n'+n.created_at.slice(0,10)).join('\n\n'):'No tienes notificaciones todavía.',skipHistory:true};
  }
  const requestLookup=/^(?:ver solicitud|consultar solicitud|ver expediente|estado de solicitud)\s+([a-zA-Z0-9_-]{1,128})$/i.exec(text);
  if(requestLookup){
    if(!customer)return {reply:'Vincula tu cuenta para consultar solicitudes privadas.',replyMarkup:accountButton,skipHistory:true};
    const r=await env.DB.prepare("SELECT r.id,r.title,r.status,r.updated_at FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1").bind(requestLookup[1],customer.id,chatId).first<{id:string;title:string;status:string;updated_at:string}>();
    if(!r)return {reply:'No encontré esa solicitud en tu cuenta. Escribe «mis solicitudes» para ver tus referencias.',skipHistory:true};
    const {results}=await env.DB.prepare("SELECT n.message,n.created_at FROM notifications n JOIN customers c ON c.id=n.user_id WHERE n.user_type='customer' AND n.type='request_reply' AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1 AND json_extract(CASE WHEN json_valid(n.data) THEN n.data ELSE '{}' END,'$.request_id')=? ORDER BY n.created_at DESC,n.id DESC LIMIT 3").bind(customer.id,chatId,r.id).all<{message:string;created_at:string}>();
    const labels:Record<string,string>={pending:'Pendiente',quoted:'Presupuestada',approved:'Aprobada',scheduled:'Programada',completed:'Completada',cancelled:'Cancelada'};
    const replies=(results||[]).map(n=>n.created_at.slice(0,10)+' · '+n.message.slice(0,900));
    return {reply:r.title+'\nReferencia: '+r.id+'\nEstado: '+(labels[r.status]||r.status)+'\n\n'+(replies.length?'Últimas respuestas del equipo:\n'+replies.join('\n\n'):'Todavía no hay una respuesta escrita del equipo.'),skipHistory:true};
  }
  if(action==='customer-requests'||action==='customer-appointments'){
    if(!customer)return {reply:'Para proteger tus datos, elige Crear cuenta o Vincular cuenta.',replyMarkup:accountButton,skipHistory:true};
    const isRequests=action==='customer-requests';
    const {results}=await env.DB.prepare(isRequests
      ?"SELECT r.id,r.title,r.status,r.created_at AS date FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.customer_id=? AND c.telegram_customer_chat_id=? AND c.is_active=1 ORDER BY r.created_at DESC LIMIT 10"
      :"SELECT a.id,a.title,a.status,a.starts_at AS date FROM appointments a JOIN customers c ON c.id=a.customer_id WHERE a.customer_id=? AND c.telegram_customer_chat_id=? AND c.is_active=1 ORDER BY a.starts_at DESC LIMIT 10")
      .bind(customer.id,chatId).all<{id:string;title:string;status:string;date:string}>();
    const labels:Record<string,string>={pending:'Pendiente',quoted:'Presupuestada',approved:'Aprobada',scheduled:'Programada',completed:'Completada',cancelled:'Cancelada',confirmed:'Confirmada',in_progress:'En proceso'};
    return {reply:results?.length?(isRequests?'Tus últimas solicitudes:\n\n':'Tus últimas citas:\n\n')+results.map(x=>x.title+'\n'+(labels[x.status]||x.status)+' · '+x.date+'\nReferencia: '+x.id).join('\n\n')+(isRequests?'\n\nEscribe «ver solicitud» seguido de su referencia para leer las respuestas del equipo.':''):'Todavía no tienes registros en esta sección.',skipHistory:true};
  }
  // An explicit commercial menu switches back to the saved request.
  // Otherwise a previously started appointment owns its date/time replies.
  const switchCommercial=action==='request-service'||action==='business-services'||action==='business-partner'||startCommercialIntake(text)||/^(?:confirmar solicitud(?: comercial)?|enviar solicitud|cancelar borrador)$/i.test(text);
  const visit=switchCommercial||prior?.contactMode==='name'||prior?.contactMode==='phone'?null:advanceAppointmentDraft(text,appointment);
  if(visit){
    if(visit.submit){
      if(!customer)return {reply:'Tu horario está guardado. Crea o vincula tu cuenta para enviar la cita; después escribe «confirmar cita».',appointment:visit.draft,replyMarkup:accountButton,skipHistory:true};
      const reply=await requestTelegramAppointment(env,customer.id,chatId,updateId,'confirmar cita '+visit.submit);
      return {reply,appointment:/^(?:Cita solicitada|Esta cita ya se solicitó)/.test(reply)?null:visit.draft,skipHistory:true};
    }
    return {reply:visit.reply,appointment:visit.draft,state:null,skipHistory:true};
  }
  // Contact-only is an explicit continuation of a confirmed review, not an account.
  // Keep names/phone outside assistant history and never authorize private reads by phone.
  if(prior?.stage==='review'&&!customer&&prior.contactMode){
    const contactText=normalize(text);
    if(/^(?:dejar numero(?: de whatsapp)?|dejar telefono|solo telefono|whatsapp)$/.test(contactText)){
      const name=cleanContactName(prior.contact||(prior.kind==='persona'?prior.company:undefined));
      const d:CommercialDraft={...prior,contact:name||undefined,contactMode:name?'phone':'name'};
      return {reply:name?'Indícame el número de WhatsApp donde podemos contactarte (incluye el prefijo del país, por ejemplo +53). Al enviarlo autorizas a Bonaire a contactarte sobre esta solicitud.':'¿Cuál es tu nombre completo como persona de contacto? Después te pediré tu número de WhatsApp.',commercial:d,replyMarkup:{remove_keyboard:true},skipHistory:true};
    }
    const interrupt=action!==null||/^(?:cancelar|cancelar borrador|cancelar solicitud comercial|no gracias|confirmar solicitud(?: comercial)?|enviar solicitud|corregir\b)/.test(contactText);
    if(!interrupt&&prior.contactMode==='name'){
      const name=cleanContactName(text);
      if(!name||/[¿?]/.test(text)||/\d/.test(name))return {reply:'Escribe el nombre de la persona de contacto, sin teléfono. Puedes cancelar el borrador.',commercial:prior,skipHistory:true,replyMarkup:{remove_keyboard:true}};
      return {reply:'Gracias. Indícame ahora el número de WhatsApp con prefijo de país. Al enviarlo autorizas a Bonaire a contactarte por esta solicitud.',commercial:{...prior,contact:name,contactMode:'phone'},skipHistory:true,replyMarkup:{remove_keyboard:true}};
    }
    if(!interrupt&&prior.contactMode==='phone'){
      const phone=normalizeContactPhone(text);
      if(!phone)return {reply:'No pude validar ese número. Escribe un teléfono cubano de 8 dígitos o el número internacional con + y prefijo de país. No se ha registrado nada.',commercial:prior,skipHistory:true,replyMarkup:{remove_keyboard:true}};
      if(!await saveGuestCommercial(env,prior,phone))return {reply:'No pude confirmar el registro. Conservé tu borrador; vuelve a intentarlo o habla con un gestor.',commercial:prior,skipHistory:true,replyMarkup:{remove_keyboard:true}};
      return {reply:'¡Solicitud recibida! Referencia: '+prior.id+'. Nuestro equipo comercial procurará comunicarse contigo por WhatsApp en un plazo de hasta 72 horas. No necesitas crear una cuenta ni efectuar ningún pago ahora.',commercial:{...prior,stage:'submitted',contactMode:undefined,guestSubmitted:true},state:null,appointment:null,skipHistory:true};
    }
  }
  const documentReply=await telegramDocuments(env,chatId,text);
  if(documentReply!==null)return {reply:documentReply,skipHistory:true};
  const intakeMessage=(!prior||prior.stage==='submitted')&&action==='request-service'?'solicitar servicio':(!prior||prior.stage==='submitted')&&action==='business-services'&&!naturalCommercialStart(text)?'empresas y negocios':(!prior||prior.stage==='submitted')&&action==='business-partner'&&!naturalCommercialStart(text)?'proveedores y alianzas':text;
  // Las acciones administrativas, nueva conversación y contacto humano no se consumen como campos.
  if(prior&&prior.stage!=='submitted'&&isCurrencyQuestion(text))return {reply:formatExchangeReply(await getElToqueRates(env.ELTOQUE_API_TOKEN))+'\n\n'+resumeCommercialIntake(prior),skipHistory:true};
  if((action===null||action==='request-service'||action==='business-services'||action==='business-partner')&&(prior||startCommercialIntake(intakeMessage)||naturalCommercialStart(intakeMessage))){
    // Una vez persistido el borrador, su ID estable evita duplicar confirmaciones.
    const step=advanceCommercialIntake(intakeMessage,prior,'tg-solicitud-'+updateId);
    if(step){
      if(step.submit&&step.draft){
        if(!customer)return {reply:'Tu solicitud está preparada y guardada. Deja un número de WhatsApp, o bien crea o vincula tu cuenta para consultar el expediente en línea. Si eliges una cuenta, después confirma la solicitud; no volveremos a pedir los datos.',commercial:{...step.draft,contactMode:'choice'},state:null,replyMarkup:contactButton,skipHistory:true};
        const d=step.draft, time=now();
        const intake=parseRequestIntake({customer_type:d.kind,available_budget_usd:d.budget,payment_method:d.payment,payment_currency:d.currency});
        if(intake.error||!intake.value)return {reply:'Revisa el borrador antes de enviarlo.',commercial:prior,state:null};
        await env.DB.batch([
          env.DB.prepare("INSERT INTO requests (id,customer_id,type,request_category_id,title,description,status,priority,location,preferred_date,created_at,updated_at) "+
            "SELECT ?,id,'consultation','consultation',?,?,'pending','medium',?,NULL,?,? FROM customers WHERE id=? AND telegram_customer_chat_id=? AND is_active=1 "+
            "ON CONFLICT(id) DO NOTHING")
            .bind(d.id,('Solicitud comercial: '+d.company).slice(0,180),'[Origen: Telegram]\nEntidad: '+d.company+'\nNecesidad: '+d.need+(d.contact?'\nPersona de contacto: '+d.contact:''),d.location||'',time,time,customer.id,chatId),
          env.DB.prepare("INSERT INTO request_intake (request_id,available_budget_usd_cents,payment_method,payment_currency,customer_type,created_at,updated_at) "+
            "SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1) ON CONFLICT(request_id) DO NOTHING")
            .bind(d.id,intake.value.available_budget_usd_cents,intake.value.payment_method,intake.value.payment_currency,intake.value.customer_type,time,time,d.id,customer.id,chatId)
        ]);
        // Un reintento puede encontrar la misma solicitud ya guardada. Verificar titularidad.
        const saved=await env.DB.prepare("SELECT r.id FROM requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1")
          .bind(d.id,customer.id,chatId).first();
        if(!saved)return {reply:'No fue posible confirmar el registro. Comprueba tu cuenta.',commercial:prior,state:null};
        return {reply:'Solicitud registrada. Referencia: '+d.id+'. Pendiente de revisión. Escribe «mis solicitudes» para consultar su estado. Puedes adjuntar fotos, PDF, Word o Excel con el texto «solicitud '+d.id+'».',commercial:{...d,stage:'submitted'},state:null,appointment:switchCommercial?null:undefined};
      }
      return {reply:step.reply,commercial:step.draft,appointment:switchCommercial?null:undefined,state:null};
    }
  }

  switch(action){
    case 'welcome':
      return {reply:'¡Hola! ☀️ Soy el asistente de Bonaire. Cuéntame con tus palabras qué necesitas.\n\n'+
        'Puedo ayudarte a elegir un inversor, calcular baterías, consultar equipos del catálogo '+
        'y conocer nuestros servicios. También puedes tocar una de las opciones que aparecen abajo.\n\n'+
        (staff?'Como parte del equipo, también puedes preguntarme por la agenda de hoy, mañana o las solicitudes pendientes.':
          'Puedes hacer consultas generales sin registrarte. Para medir la atención, Bonaire conserva tu ID de Telegram, nombre visible y usuario si existe; no recibe tu teléfono automáticamente. Para borrar el historial escribe «borrar historial». Si deseas consultar datos privados o registrar una solicitud, escribe «mi cuenta». Si trabajas en Bonaire, vincula tu cuenta de personal desde /admin.')};
    case 'help':
      return {reply:'Hablemos de forma natural, como con un asesor de Bonaire. 😊\n\n'+
        'Por ejemplo, puedes decirme «Necesito energía para mi nevera y dos aires acondicionados», '+
        '«Quiero saber qué inversores venden» o «Necesito una reparación».\n\n'+
        (staff?'También puedes preguntar «¿Qué trabajos hay mañana?», «¿Cuántas solicitudes faltan?» '+
          'o «¿Cómo activo el recordatorio de las 7?».':
          'Puedes crear tu cuenta, registrar solicitudes y consultar tus registros aquí mismo en Telegram. Escribe «mi cuenta».')};
    case 'new-chat':
      return {reply:'Empezamos otra conversación. ¿Qué te gustaría resolver hoy en Bonaire? ☀️',
        state:null,newThread:true,skipHistory:true};
    case 'erase-history':{
      await env.DB.batch([
        env.DB.prepare('DELETE FROM telegram_bot_messages WHERE chat_id=?').bind(chatId),
        env.DB.prepare('DELETE FROM telegram_visitor_profiles WHERE chat_id=?').bind(chatId)
      ]);
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
        'escribe «solicitar cita» aquí mismo para elegir fecha y hora de Cuba.',skipHistory:true};
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
    case 'business-services':
      return {reply:'Atención empresarial · Bonaire\n\nAtendemos mipymes, empresas estatales, TCP, cooperativas y otros negocios. Podemos evaluar proyectos, suministro, instalaciones, reparaciones y mantenimiento; no solo viviendas.\n\n¿Qué necesita tu organización y en qué municipio sería el trabajo? No pedimos anticipos ni autorizaciones en este primer contacto. Esta conversación todavía no registra una solicitud.',state:null};
    case 'business-partner':
      return {reply:'Propuesta comercial · Bonaire\n\nTambién recibimos ofertas de fabricantes y proveedores, marcas que buscan promoción, distribución en Cuba o alianzas en otros sectores.\n\n¿Qué empresa representas, de qué país es y qué colaboración propones? No hace falta tener contrato ni presupuesto cerrado. La conversación no registra todavía un expediente ni compromete un acuerdo.',state:null};
    case 'request-service':
      return {reply:'Claro. ¿Necesitas instalación, mantenimiento, reparación o una evaluación solar? '+
        'Cuéntame qué equipo tienes y en qué municipio de Cuba sería el trabajo.\n\n'+
        'Para que la solicitud quede registrada y podamos darle seguimiento, '+
        'puedes enviarla desde tu cuenta en Bonaire: '+site+
        '\nNo programaré una visita sin una solicitud confirmada.',state:null};
    case 'human':{
      const contact=await humanWhatsAppReply(env.DB);
      return {reply:contact.reply,state:null,
        replyMarkup:contact.buttons.length
          ?{inline_keyboard:contact.buttons.map(b=>[{text:b.text,url:b.url}])}
          :undefined};
    }
  }

  if(isOutOfScopeMessage(text))return {reply:OUT_OF_SCOPE_REPLY};
  if(isCurrencyQuestion(text))return {reply:formatExchangeReply(await getElToqueRates(env.ELTOQUE_API_TOKEN))};
  if(detectIntent(text)==='telegram'){
    return {reply:'Ya estás conversando conmigo aquí en Telegram. Puedes escribirme con libertad '+
      'sobre los equipos y servicios de Bonaire. El WhatsApp de la empresa sigue atendido por gestores humanos.'};
  }

  // Priorizar propuestas y servicios empresariales antes de activar un asesor solar.
  // Historial limitado al chat/hilo actual: jamás reutilizar el de otra empresa.
  const commercialHistory=await env.DB.prepare(
    "SELECT role,content FROM telegram_bot_messages WHERE chat_id=? AND thread_id=? "+
    "ORDER BY created_at DESC,rowid DESC LIMIT 24"
  ).bind(chatId,threadId).all<{role:string;content:string}>();
  const recent=(commercialHistory.results||[]).reverse();
  if(!prior){
    const recovered=recoverLegacyCommercialIntake(recent,text,'tg-solicitud-'+updateId);
    if(recovered)return {reply:'Retomé tu conversación comercial. '+recovered.reply,commercial:recovered.draft,state:null};
  }
  const commercial=businessProposalReply(text,recent) || businessServiceReply(text,recent);
  if(commercial)return {reply:commercial+'\n\nSi quieres tramitarlo aquí mismo, escribe «registrar solicitud comercial». No necesitas salir de Telegram.',state:null};

  const solar=advanceSolarGuidance(text,state);
  if(solar.handled)return {reply:solar.reply,state:solar.state};
  const context=await loadAssistantContext(env.DB);
  const history=await env.DB.prepare(
    "SELECT role,content FROM telegram_bot_messages WHERE chat_id=? AND thread_id=? "+
    "ORDER BY created_at DESC LIMIT 12"
  ).bind(chatId,threadId).all<{role:string;content:string}>();
  const fallback=generateResponse(text,context,(history.results||[]).reverse());
  if(!prior&&!appointment&&env.AI&&env.WORKERS_AI_ENABLED!=='false'&&fallback.intent!=='general'){
    const ai=await callAI({...env,AI_API_KEY:undefined,AI_API_BASE:undefined},context,[],text);
    if(ai.text)return {reply:ai.text.slice(0,3000)+'\n\nOrientación del asistente. Las solicitudes y citas solo se registran mediante su confirmación explícita.'};
  }
  return {reply:fallback.text};
}
async function claimAttachmentQuota(env:Env,chatId:string):Promise<boolean>{
  const time=now(),threshold=new Date(Date.now()-3600000).toISOString();
  const result=await env.DB.prepare(
    "INSERT INTO telegram_attachment_quota(chat_id,window_start,attempts) VALUES (?,?,1) "+
    "ON CONFLICT(chat_id) DO UPDATE SET window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END,"+
    "attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END WHERE window_start<? OR attempts<12"
  ).bind(chatId,time,threshold,threshold,threshold).run();
  return !!result.meta?.changes;
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
    let state:SolarState|null=null, commercial:CommercialDraft|null=null, appointment:AppointmentDraft|null=null;
    const currentCustomer=await currentTelegramCustomer(env,input.chatId);
    try{const parsed=JSON.parse(session.solar_context);
      if(parsed&&typeof parsed==='object'&&'commercial' in parsed){state=parsed.solar||null;const sameOwner=(parsed.customerId??null)===(currentCustomer?.id??null)||parsed.customerId===null&&!!currentCustomer;commercial=sameOwner?parsed.commercial||null:null;appointment=sameOwner?parsed.appointment||null:null;}
      else state=parsed as SolarState|null;
    }catch{/* recuperar estado vacío */}
    let decision:BotDecision|undefined;
    const site=siteForBot(env);
    const draft=await activeRegistration(env,input.chatId);
    if(isCustomerCode(input.text)){
      if(currentCustomer)decision={reply:'Tu cuenta de cliente ya está vinculada.',skipHistory:true};
      else if(await redeemCustomerCode(env,input.chatId,input.text)){
        await cancelRegistration(env,input.chatId);
        decision={reply:'¡Cuenta vinculada correctamente! '+(appointment?appointmentDraftReply(appointment):commercial?resumeCommercialIntake(commercial):'Ya puedes consultar tus cotizaciones, solicitudes y citas aquí. Puedes seguir en este chat o abrir Bonaire: '+site),skipHistory:true,state:null};
      }else decision={reply:'Código inválido, vencido o ya utilizado. Entra a Mi perfil y genera uno nuevo.',skipHistory:true};
    }else if(startsRegistration(input.text)){
      if(currentCustomer)decision={reply:'Ya tienes una cuenta vinculada. Puedes entrar a Bonaire o seguir aquí.',skipHistory:true,replyMarkup:{inline_keyboard:[[{text:'Entrar en Bonaire',url:site+'/entrar'}]]}};
      else{const registration=await startRegistration(env,input.chatId,input.updateId);decision=registrationDecision(registration.stage,site);if(registration.stage==='name')decision.reply='Vamos a crear tu cuenta Bonaire. Usaremos estos datos para tu cuenta y tus servicios. Puedes escribir Cancelar registro en cualquier momento. Nunca envíes tu contraseña por chat.\n\n'+decision.reply;}
    }else if(draft&&/^(?:vincular cuenta|vincular cuenta existente|vincular cuenta de cliente)$/i.test(input.text)){
      await cancelRegistration(env,input.chatId);
      decision={reply:'Registro cancelado. Inicia sesión en Bonaire, abre Mi perfil → Vincular Telegram y envíame el código de un solo uso.',skipHistory:true,state:null,replyMarkup:{inline_keyboard:[[{text:'Abrir mi perfil',url:site+'/perfil'}]]}};
    }else if(draft){
      if(currentCustomer){await cancelRegistration(env,input.chatId);decision={reply:'Tu cuenta ya está creada y vinculada. '+(appointment?appointmentDraftReply(appointment):commercial?resumeCommercialIntake(commercial):'Escribe «mi cuenta» o continúa con tus consultas.'),skipHistory:true};}
      else if(cancelsRegistration(input.text)){
        await cancelRegistration(env,input.chatId);
        const action=classifyTelegramMessage(input.text);
        if(action==='new-chat'||action==='erase-history')decision=await decide(env,input.chatId,input.text,state,session.thread_id,commercial,input.updateId);
        else decision={reply:'Registro cancelado. No se creó ninguna cuenta. '+(commercial?'Tu borrador comercial sigue guardado.':'Puedes volver a intentarlo cuando quieras.'),skipHistory:true,state:null};
      }else if(draft.stage==='password'){
        await removeUnexpectedPasswordMessage(env,input.chatId,input.messageId);
        decision=registrationDecision('password',site);
      }else{
        const step=await saveRegistrationStep(env,draft,input.text,input.updateId);
        decision=registrationDecision(step.stage,site,!step.valid);
      }
    }
    decision=decision||await decide(env,input.chatId,input.text,state,session.thread_id,commercial,input.updateId,appointment);
    const nextCommercial=decision.newThread?null:decision.commercial===undefined?commercial:decision.commercial;
    const nextAppointment=decision.newThread?null:decision.appointment===undefined?appointment:decision.appointment;
    const linkedCustomer=await currentTelegramCustomer(env,input.chatId);
    const nextThread=decision.newThread?crypto.randomUUID():session.thread_id;
    const nextState=decision.newThread?null:decision.state===undefined?state:decision.state;
    // Refrescar el vínculo después de procesar el mensaje: el OTP puede haberlo creado
    // o «desvincular» puede haberlo revocado en esta misma interacción.
    const currentStaff=await currentTelegramStaff(env,input.chatId);
    const draftKeyboard:TelegramReplyMarkup|undefined=nextCommercial?.stage==='review'&&!nextCommercial.contactMode?{keyboard:[[{text:'Confirmar solicitud comercial'},{text:'Cancelar borrador'}],[{text:'Hablar con una persona'}]],resize_keyboard:true,one_time_keyboard:true,input_field_placeholder:'Revisa o confirma tu solicitud…'}:undefined;
    const keyboard=decision.replyMarkup||draftKeyboard||telegramReplyKeyboard(Boolean(currentStaff),nextState?.stage,decision.keyboardView||'normal');
    const renderedReply=canonicalTelegramLinks(presentTelegramReply(decision.reply,nextState?.stage),site);
    await sendTelegramText(env,input.chatId,renderedReply,keyboard);
    const audit=decision.skipHistory?[]:[
      env.DB.prepare(
        "INSERT INTO telegram_bot_messages (id,chat_id,thread_id,role,content,created_at) VALUES (?,?,?,'user',?,?)"
      ).bind(crypto.randomUUID(),input.chatId,nextThread,input.text,time),
      env.DB.prepare(
        "INSERT INTO telegram_bot_messages (id,chat_id,thread_id,role,content,created_at) VALUES (?,?,?,'assistant',?,?)"
      ).bind(crypto.randomUUID(),input.chatId,nextThread,renderedReply,time)
    ];
    // Guardar únicamente datos visibles del remitente autenticado por el webhook.
    // No guardar un perfil de visitante para el personal ni una cuenta vinculada.
    if(!decision.skipHistory&&!currentStaff&&!currentCustomer){
      audit.push(env.DB.prepare('INSERT INTO telegram_visitor_profiles(chat_id,display_name,username,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at')
        .bind(input.chatId,[input.firstName,input.lastName].filter(Boolean).join(' ').trim(),input.username,time));
    }
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE telegram_bot_sessions SET thread_id=?,solar_context=?,window_start=?,window_count=?,updated_at=? WHERE chat_id=?'
      ).bind(nextThread,JSON.stringify({solar:nextState,commercial:nextCommercial,appointment:nextAppointment,customerId:linkedCustomer?.id??null}),current?session.window_start:time,count,time,input.chatId),
      ...audit,
      env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?")
        .bind(time,input.updateId)
    ]);
  }catch(e){
    console.error('Error al procesar update de Telegram',input.updateId);
    await env.DB.prepare("UPDATE telegram_bot_updates SET status='failed',updated_at=? WHERE update_id=?")
      .bind(now(),input.updateId).run().catch(()=>null);
    throw e;
  }
}
// Do not download unsupported media or silently ignore a valid private upload.
export function unsupportedTelegramMessage(body:unknown):{updateId:string;chatId:string;reply:string}|null{
 const b=body as any,m=b?.message;
 if(!validUpdateId(b?.update_id)||m?.chat?.type!=='private'||!validChatId(m.chat.id)||m.from?.id!==m.chat.id||m.from?.is_bot===true)return null;
 if(!m.photo&&!m.document&&!m.video&&!m.audio&&!m.voice&&!m.sticker&&!m.animation&&!m.video_note&&!m.contact&&!m.location)return null;
 const reply=m.photo?'No pude aceptar esa foto. Envíala como fotografía de hasta 8 MB y añade «solicitud REFERENCIA» si ya tienes un expediente.':m.voice||m.audio||m.video||m.video_note?'Por ahora no puedo escuchar audios ni analizar videos. Escríbeme la necesidad y, si ya tienes solicitud, adjunta fotos, PDF, DOCX o XLSX de hasta 8 MB.':'Este tipo de mensaje no se incorpora al expediente. Puedes escribir la información o adjuntar fotos, PDF, DOCX o XLSX de hasta 8 MB con «solicitud REFERENCIA».';
 return {updateId:String(b.update_id),chatId:String(m.chat.id),reply};
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
  const callback=extractTelegramAccountCallback(body);
  if(callback){
    await acknowledgeCallback(env,callback.id);
    try{await processUpdate(env,callback.input);return c.json({ok:true});}
    catch{return c.json({error:'Falló la entrega; Telegram puede reintentar'},503);}
  }
  const document=extractTelegramDocument(body);
  if(document){
    if(!await claimUpdate(env,document.updateId,document.chatId))return c.json({ok:true});
    if(!await claimAttachmentQuota(env,document.chatId)){
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?").bind(now(),document.updateId).run();
      return c.json({ok:true});
    }
    try{
      await sendTelegramText(env,document.chatId,await receiveTelegramDocument(env,document));
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?").bind(now(),document.updateId).run();
      return c.json({ok:true});
    }catch{
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='failed',updated_at=? WHERE update_id=?").bind(now(),document.updateId).run().catch(()=>null);
      return c.json({error:'No se pudo procesar documento'},503);
    }
  }
  const photo=extractTelegramPhoto(body);
  if(photo){
    if(!await claimUpdate(env,photo.updateId,photo.chatId))return c.json({ok:true});
    if(!await claimAttachmentQuota(env,photo.chatId)){
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?").bind(now(),photo.updateId).run();
      return c.json({ok:true});
    }
    try{
      const reply=await receiveTelegramPhoto(env,photo);
      await sendTelegramText(env,photo.chatId,reply);
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?")
        .bind(now(),photo.updateId).run();
      return c.json({ok:true});
    }catch{
      // No loguear URLs de descarga que contienen el token del bot.
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='failed',updated_at=? WHERE update_id=?")
        .bind(now(),photo.updateId).run().catch(()=>null);
      return c.json({error:'No se pudo procesar la foto'},503);
    }
  }
  const message=extractTelegramMessage(body);
  if(!message){
    const unsupported=unsupportedTelegramMessage(body);
    if(!unsupported||!await claimUpdate(env,unsupported.updateId,unsupported.chatId))return c.json({ok:true});
    try{
      if(await claimAttachmentQuota(env,unsupported.chatId))await sendTelegramText(env,unsupported.chatId,unsupported.reply);
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='sent',updated_at=? WHERE update_id=?").bind(now(),unsupported.updateId).run();
      return c.json({ok:true});
    }catch{
      await env.DB.prepare("UPDATE telegram_bot_updates SET status='failed',updated_at=? WHERE update_id=?").bind(now(),unsupported.updateId).run().catch(()=>null);
      return c.json({error:'No se pudo responder al archivo'},503);
    }
  }
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
      allowed_updates:['message','callback_query'],max_connections:1}),
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
