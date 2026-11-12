/**
 * Bonaire WhatsApp Business Platform — integración inicial.
 * Webhook Meta verificado por HMAC SHA-256; sin secretos => inactivo (503).
 * Los contactos de WhatsApp NO son automáticamente clientes autenticados.
 * El personal solo recibe datos internos después de vincular su sesión staff con un código efímero.
 */
import { Hono } from 'hono';
import type { Env } from '../types';
import { requireStaffAuth, getUser } from '../middleware';
import { isOutOfScopeMessage, OUT_OF_SCOPE_REPLY, isCurrencyQuestion, generateResponse, loadAssistantContext } from '../assistant-engine';
import { advanceSolarGuidance, type SolarState } from '../solar-guidance';
import { getElToqueRates, formatExchangeReply } from '../exchange-rates';

export const whatsappRoutes=new Hono<{Bindings:Env;Variables:{user?:any}}>();
const encoder=new TextEncoder();
const iso=()=>new Date().toISOString();
const isPhone=(v:unknown):v is string=>typeof v==='string' && /^\d{8,17}$/.test(v);

async function hmac(secret:string,content:Uint8Array):Promise<Uint8Array>{
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,content);
  return new Uint8Array(signature);
}
export async function verifyMetaSignature(secret:string,body:Uint8Array,signature:string|null):Promise<boolean>{
  if(!signature||!/^sha256=[0-9a-f]{64}$/i.test(signature))return false;
  const given=new Uint8Array(signature.slice(7).match(/.{2}/g)!.map(s=>parseInt(s,16)));
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,given,body);
}
async function codeHash(secret:string,code:string):Promise<string>{
  const bytes=await hmac(secret,encoder.encode('staff-link:'+code));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function maskWhatsAppId(id:string):string{return '•••'+id.slice(-4);}
export function extractIncoming(payload:any,expectedPhoneId:string){
  const messages:{id:string;from:string;text:string}[]=[];
  if(payload?.object!=='whatsapp_business_account'||!Array.isArray(payload.entry))return messages;
  for(const entry of payload.entry){
    for(const change of (Array.isArray(entry?.changes)?entry.changes:[])){
      if(change?.field!=='messages'||String(change?.value?.metadata?.phone_number_id||'')!==expectedPhoneId)continue;
      for(const item of (Array.isArray(change?.value?.messages)?change.value.messages:[])){
        if(typeof item?.id!=='string'||item.id.length>240||!isPhone(item.from))continue;
        if(item.type==='text' && typeof item.text?.body==='string'){
          messages.push({id:item.id,from:item.from,text:item.text.body.trim().slice(0,4000)});
        } else {
          messages.push({id:item.id,from:item.from,text:'[unsupported-media]'});
        }
      }
    }
  }
  return messages;
}
async function sendText(env:Env,to:string,reply:string):Promise<void>{
  if(!env.WA_ACCESS_TOKEN||!env.WA_PHONE_NUMBER_ID||!env.WA_GRAPH_API_VERSION)throw Error('Meta Cloud API no configurada');
  if(!/^v\d+\.\d+$/.test(env.WA_GRAPH_API_VERSION)||!/^\d+$/.test(env.WA_PHONE_NUMBER_ID))throw Error('Configuración Graph inválida');
  const url='https://graph.facebook.com/'+env.WA_GRAPH_API_VERSION+'/'+env.WA_PHONE_NUMBER_ID+'/messages';
  const response=await fetch(url,{
    method:'POST',headers:{Authorization:'Bearer '+env.WA_ACCESS_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',
      text:{preview_url:false,body:reply.slice(0,3900)}}),
    signal:AbortSignal.timeout(8500)
  });
  if(!response.ok)throw Error('WhatsApp Graph no aceptó el mensaje ('+response.status+')');
}
function cubaDay(date:Date):string{
  const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=format.formatToParts(date);
  const read=(key:string)=>parts.find(p=>p.type===key)?.value||'';
  return read('year')+'-'+read('month')+'-'+read('day');
}
function cubaTime(date:Date):string{
  return new Intl.DateTimeFormat('es-CU',{timeZone:'America/Havana',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
async function staffAccount(env:Env,from:string):Promise<{id:string;name:string;role:string}|null>{
  return env.DB.prepare(`SELECT a.id,a.email AS name,a.role FROM whatsapp_staff_links l
    INNER JOIN admin_users a ON a.id=l.admin_user_id
    WHERE l.wa_id=? AND a.is_active=1 AND a.role IN ('admin','operator')`)
    .bind(from).first<{id:string;name:string;role:string}>();
}
async function staffAppointments(env:Env,tomorrow:boolean):Promise<string>{
  const now=new Date();
  const today=cubaDay(now);
  // Avanzar un día CALENDARIO cubano: evita errores de horario de verano al sumar 24 h.
  const day=tomorrow?new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10):today;
  const start=new Date(now.getTime()-36*3600000).toISOString();
  const end=new Date(now.getTime()+72*3600000).toISOString();
  const result=await env.DB.prepare(`SELECT a.id,a.title,a.starts_at,a.status,
    cu.name AS customer_name,cu.phone,cu.address,cu.city,cu.province
    FROM appointments a LEFT JOIN customers cu ON cu.id=a.customer_id
    WHERE a.status NOT IN ('cancelled','completed') AND a.starts_at BETWEEN ? AND ?
    ORDER BY a.starts_at ASC LIMIT 250`).bind(start,end).all<any>();
  const rows=(result.results||[]).filter(item=>{
    const stamp=new Date(item.starts_at);
    return Number.isFinite(stamp.getTime()) && cubaDay(stamp)===day;
  });
  if(!rows.length)return 'Agenda Bonaire: no hay citas pendientes para '+(tomorrow?'mañana':'hoy')+' ('+day+').';
  const lines=rows.slice(0,15).map((item,i)=>{
    const when=cubaTime(new Date(item.starts_at));
    const location=[item.address,item.city,item.province].filter(Boolean).join(', ');
    return (i+1)+'. '+when+' · '+item.title+'\nCliente: '+(item.customer_name||'Sin asignar')+
      (location?'\nLugar: '+location:'')+(item.phone?'\nTeléfono: '+item.phone:'');
  });
  return 'Agenda Bonaire · '+(tomorrow?'mañana':'hoy')+' ('+day+') · '+rows.length+' cita(s):\n\n'+
    lines.join('\n\n')+(rows.length>15?'\n\nHay más citas: consulta /admin.':'')+
    '\n\nConfirma el trabajo con cada cliente antes de desplazarte.';
}
async function staffPending(env:Env):Promise<string>{
  const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status='pending'").first<{n:number}>();
  return 'Bonaire tiene '+(row?.n||0)+' solicitud(es) pendientes. Entra en /admin → Solicitudes para revisarlas y asignar estados.';
}
async function linkStaff(env:Env,from:string,code:string):Promise<string>{
  if(!env.WA_APP_SECRET)return 'La vinculación todavía no está habilitada.';
  const now=iso();
  const old=await env.DB.prepare('SELECT attempts,window_start FROM whatsapp_link_attempts WHERE wa_id=?')
    .bind(from).first<{attempts:number;window_start:string}>();
  const within=old&&Date.now()-Date.parse(old.window_start)<15*60*1000;
  if(within && old.attempts>=5)return 'Demasiados intentos. Espera 15 minutos o genera un nuevo código desde /admin.';
  await env.DB.prepare(`INSERT INTO whatsapp_link_attempts (wa_id,attempts,window_start) VALUES (?,?,?)
    ON CONFLICT(wa_id) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start`)
    .bind(from,within?old!.attempts+1:1,within?old!.window_start:now).run();
  const hash=await codeHash(env.WA_APP_SECRET,code);
  const row=await env.DB.prepare(`SELECT l.admin_user_id FROM whatsapp_staff_link_codes l
    JOIN admin_users a ON a.id=l.admin_user_id
    WHERE l.code_hash=? AND l.expires_at>? AND a.is_active=1 AND a.role IN ('admin','operator')`)
    .bind(hash,now).first<{admin_user_id:string}>();
  if(!row)return 'Código inválido o vencido. Entra en tu cuenta de personal en /admin y genera otro.';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM whatsapp_staff_links WHERE wa_id=? OR admin_user_id=?').bind(from,row.admin_user_id),
    env.DB.prepare('INSERT INTO whatsapp_staff_links (wa_id,admin_user_id,verified_at) VALUES (?,?,?)')
      .bind(from,row.admin_user_id,now),
    env.DB.prepare('DELETE FROM whatsapp_staff_link_codes WHERE admin_user_id=?').bind(row.admin_user_id),
    env.DB.prepare('DELETE FROM whatsapp_link_attempts WHERE wa_id=?').bind(from)
  ]);
  return 'Número vinculado a tu cuenta de personal Bonaire. Comandos disponibles: HOY, MAÑANA, PENDIENTES, AYUDA y DESVINCULAR. No compartas datos de clientes fuera del equipo autorizado.';
}
type Decision={reply:string;solarContext?:SolarState|null};
async function decide(env:Env,from:string,input:string):Promise<Decision>{
  const msg=input.trim(),normal=msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(msg==='[unsupported-media]')return {reply:'Por el momento puedo recibir solo mensajes de texto. Escribe qué necesitas de Bonaire.'};
  const match=/^vincular\s+(\d{8})$/i.exec(normal);
  if(match)return {reply:await linkStaff(env,from,match[1])};
  const staff=await staffAccount(env,from);
  if(staff){
    if(/^(desvincular|salir del equipo)$/.test(normal)){
      await env.DB.prepare('DELETE FROM whatsapp_staff_links WHERE wa_id=? AND admin_user_id=?').bind(from,staff.id).run();
      return {reply:'Desvinculaste este WhatsApp de tu cuenta de personal. Para volver a consultar la agenda, solicita un código en /admin.'};
    }
    if(/^(hoy|agenda hoy|trabajos hoy)$/.test(normal))return {reply:await staffAppointments(env,false)};
    if(/^(manana|agenda manana|trabajos manana)$/.test(normal))return {reply:await staffAppointments(env,true)};
    if(/^(pendientes|tickets pendientes)$/.test(normal))return {reply:await staffPending(env)};
    if(/^(ayuda|menu|comandos)$/.test(normal))
      return {reply:'Bonaire · Equipo interno.\nHOY: citas de hoy.\nMAÑANA: citas de mañana.\nPENDIENTES: solicitudes por gestionar.\nDESVINCULAR: cerrar el vínculo de este número.\nTambién puedo asesorar sobre nuestros equipos solares.'};
  }else if(/^(hoy|manana|agenda|pendientes|tickets|personal|admin|moderador)$/.test(normal)){
    return {reply:'Las agendas y solicitudes internas son privadas del equipo. Para acceder, inicia sesión en /admin y vincula este número con un código temporal. No se otorgan permisos solo por el teléfono.'};
  }
  const previous=await env.DB.prepare('SELECT solar_context FROM whatsapp_conversations WHERE wa_id=?')
    .bind(from).first<{solar_context:string}>();
  let state:SolarState|null=null;
  try{state=previous?.solar_context?JSON.parse(previous.solar_context) as SolarState:null;}catch{state=null;}
  if(/^(nuevo|nuevo chat|reiniciar chat)$/.test(normal))
    return {reply:'Nueva conversación de Bonaire. ¿Necesitas asesoría solar, precios de equipos o solicitar un servicio?',solarContext:null};
  if(isOutOfScopeMessage(msg))return {reply:OUT_OF_SCOPE_REPLY};
  if(isCurrencyQuestion(msg))return {reply:formatExchangeReply(await getElToqueRates(env.ELTOQUE_API_TOKEN))};
  const guided=advanceSolarGuidance(msg,state);
  if(guided.handled)return {reply:guided.reply,solarContext:guided.state};
  const ctx=await loadAssistantContext(env.DB);
  return {reply:generateResponse(msg,ctx).text};
}
async function claim(env:Env,id:string,from:string):Promise<boolean>{
  const now=iso(),old=new Date(Date.now()-2*60*1000).toISOString();
  const insert=await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_events
    (message_id,wa_id,status,created_at,updated_at) VALUES (?,?,'processing',?,?)`)
    .bind(id,from,now,now).run();
  if(insert.meta?.changes)return true;
  const retry=await env.DB.prepare(`UPDATE whatsapp_events SET status='processing',updated_at=?
    WHERE message_id=? AND wa_id=? AND (status='failed' OR (status='processing' AND updated_at<?))`)
    .bind(now,id,from,old).run();
  return Boolean(retry.meta?.changes);
}
async function processMessage(env:Env,message:{id:string;from:string;text:string}):Promise<void>{
  if(!await claim(env,message.id,message.from))return;
  try{
    const now=iso();
    await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_conversations
      (wa_id,solar_context,window_start,window_count,updated_at) VALUES (?,'{}',?,0,?)`)
      .bind(message.from,now,now).run();
    const quota=await env.DB.prepare('SELECT window_start,window_count FROM whatsapp_conversations WHERE wa_id=?')
      .bind(message.from).first<{window_start:string|null;window_count:number}>();
    const ongoing=quota?.window_start && Date.now()-Date.parse(quota.window_start)<3600000;
    const count=(ongoing?(quota?.window_count||0):0)+1;
    if(count>50) {
      // Evitar consultas y mensajes ilimitados desde el mismo WhatsApp.
      await env.DB.prepare("UPDATE whatsapp_events SET status='sent',updated_at=? WHERE message_id=?")
        .bind(now,message.id).run();
      return;
    }
    const decision=await decide(env,message.from,message.text);
    await sendText(env,message.from,decision.reply);
    await env.DB.batch([
      env.DB.prepare(`UPDATE whatsapp_conversations
        SET solar_context=COALESCE(?,solar_context),window_start=?,window_count=?,updated_at=? WHERE wa_id=?`)
        .bind(decision.solarContext===undefined?null:JSON.stringify(decision.solarContext),ongoing?quota!.window_start:now,count,now,message.from),
      env.DB.prepare("UPDATE whatsapp_events SET status='sent',updated_at=? WHERE message_id=?")
        .bind(now,message.id)
    ]);
  } catch(e){
    console.error('WhatsApp bot: procesamiento falló',message.id,e);
    await env.DB.prepare("UPDATE whatsapp_events SET status='failed',updated_at=? WHERE message_id=?")
      .bind(iso(),message.id).run();
    throw e;
  }
}
whatsappRoutes.get('/webhook', async c=>{
  const token=c.env.WA_VERIFY_TOKEN;
  if(!token)return c.text('WhatsApp no configurado',503);
  const mode=c.req.query('hub.mode'),challenge=c.req.query('hub.challenge'),supplied=c.req.query('hub.verify_token');
  if(mode==='subscribe' && supplied===token && typeof challenge==='string' && /^\d{1,100}$/.test(challenge))
    return c.text(challenge,200);
  return c.text('Verificación no autorizada',403);
});
whatsappRoutes.post('/webhook', async c=>{
  const env=c.env;
  if(!env.WA_APP_SECRET||!env.WA_ACCESS_TOKEN||!env.WA_PHONE_NUMBER_ID||!env.WA_GRAPH_API_VERSION)
    return c.json({error:'Canal de WhatsApp no configurado'},503);
  const length=Number(c.req.header('content-length')||'0');
  if(length>128*1024)return c.text('Payload demasiado grande',413);
  const body=new Uint8Array(await c.req.raw.arrayBuffer());
  if(body.byteLength>128*1024)return c.text('Payload demasiado grande',413);
  if(!await verifyMetaSignature(env.WA_APP_SECRET,body,c.req.header('x-hub-signature-256')||null))
    return c.text('Firma inválida',403);
  let payload:any;
  try{payload=JSON.parse(new TextDecoder().decode(body));}
  catch{return c.text('JSON inválido',400);}
  const list=extractIncoming(payload,env.WA_PHONE_NUMBER_ID);
  // Los webhooks de estados no tienen mensajes entrantes: devolver 200 sin responder.
  if(!list.length)return c.json({received:true});
  if(list.length>20)return c.text('Lote demasiado grande para esta versión del bot',503);
  try{
    for(const msg of list)await processMessage(env,msg);
    return c.json({received:true});
  }catch{return c.json({error:'No se pudo entregar la respuesta. Meta puede reintentar.'},503);}
});

whatsappRoutes.get('/admin/link',requireStaffAuth,async c=>{
  const user=getUser(c)!;
  const linked=await c.env.DB.prepare('SELECT wa_id,verified_at FROM whatsapp_staff_links WHERE admin_user_id=?')
    .bind(user.user_id).first<{wa_id:string;verified_at:string}>();
  return c.json({linked:!!linked,phone_masked:linked?maskWhatsAppId(linked.wa_id):null,verified_at:linked?.verified_at||null});
});
whatsappRoutes.post('/admin/link-code',requireStaffAuth,async c=>{
  if(!c.env.WA_APP_SECRET||!c.env.WA_VERIFY_TOKEN||!c.env.WA_ACCESS_TOKEN||!c.env.WA_PHONE_NUMBER_ID)
    return c.json({error:'El bot aún no está configurado en Meta/Cloudflare.'},503);
  const user=getUser(c)!;
  const random=crypto.getRandomValues(new Uint32Array(1))[0];
  const code=String(random%100000000).padStart(8,'0');
  const hash=await codeHash(c.env.WA_APP_SECRET,code);
  const now=iso(),expires=new Date(Date.now()+10*60*1000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM whatsapp_staff_link_codes WHERE admin_user_id=?').bind(user.user_id),
    c.env.DB.prepare('INSERT INTO whatsapp_staff_link_codes (code_hash,admin_user_id,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(hash,user.user_id,expires,now),
  ]);
  return c.json({code,expires_at:expires,instruction:'Desde tu WhatsApp envía al número oficial del bot: VINCULAR '+code});
});
whatsappRoutes.delete('/admin/link',requireStaffAuth,async c=>{
  const user=getUser(c)!;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM whatsapp_staff_links WHERE admin_user_id=?').bind(user.user_id),
    c.env.DB.prepare('DELETE FROM whatsapp_staff_link_codes WHERE admin_user_id=?').bind(user.user_id),
  ]);
  return c.json({message:'Vínculo de WhatsApp eliminado.'});
});
