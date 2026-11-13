/**
 * Interfaz conversacional de Telegram para Bonaire.
 * La clasificación es una sugerencia de intención, NO una autorización.
 * Todas las consultas internas deben comprobar el vínculo staff en el servidor.
 */
import type { SolarStage } from './solar-guidance';

export type TelegramAction =
  | 'welcome' | 'help' | 'new-chat' | 'history' | 'erase-history'
  | 'link-help' | 'unlink' | 'agenda-today' | 'agenda-tomorrow' | 'pending'
  | 'reminders-enable' | 'reminders-disable' | 'reminders-info'
  | 'solar' | 'products' | 'services' | 'request-service' | 'human' | null;

const normalize=(input:string)=>input.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\p{L}\p{N}\s]/gu,' ')
  .replace(/\s+/g,' ').trim();

export function classifyTelegramMessage(input:string):TelegramAction {
  const s=normalize(input);
  if(!s)return null;
  if(/^(?:start|iniciar|hola|holaa|hola bonaire|buenos dias|buenas tardes|buenas noches|saludos)$/.test(s))
    return 'welcome';
  if(/^(?:ayuda|help|menu|opciones|que puedes hacer|que sabes hacer|como funcionas|como funciona esto)$/.test(s))
    return 'help';
  if(/^(?:nuevo|nueva|new|nuevo chat|nueva conversacion|empezar de nuevo|comenzar de nuevo|otro chat|reiniciar conversacion)$/.test(s))
    return 'new-chat';
  if(/^(?:borrarhistorial|borrar historial|borra mi historial|eliminar historial|elimina mis mensajes|borra nuestros mensajes)$/.test(s))
    return 'erase-history';
  if(/^(?:historial|ver historial|mi historial|que hemos hablado|de que hemos hablado|mis mensajes anteriores|conversaciones anteriores)$/.test(s))
    return 'history';
  if(/^(?:desvincular|desvincular equipo|desvincular mi cuenta|quitar vinculo del equipo|desconectar mi telegram del equipo)$/.test(s))
    return 'unlink';
  if(/^(?:vincular|vincular equipo|vincular mi cuenta|soy del equipo|soy trabajador de bonaire|soy administrador de bonaire|trabajo en bonaire|acceso del personal|acceso al equipo)$/.test(s))
    return 'link-help';

  // Las preferencias de recordatorios son cambios de estado: exigir intención explícita.
  if(/^(?:avisos no|recordatorios no|desactivar recordatorios|desactivar avisos|pausar recordatorios|no quiero recordatorios|no me envies avisos|deja de enviarme avisos|cancelar recordatorios|silenciar recordatorios|desactiva mis recordatorios|desactiva los avisos diarios)$/.test(s))
    return 'reminders-disable';
  if(/^(?:avisos si|recordatorios si|activar recordatorios|activa recordatorios|activar avisos|activar avisos diarios|activa los avisos diarios|quiero recibir avisos diarios|quiero recibir recordatorios|enviame recordatorios diarios|recuerdame los trabajos todos los dias|avisame todos los dias a las 7|activa mis recordatorios de las 7)$/.test(s))
    return 'reminders-enable';
  if(/^(?:recordatorios|mis avisos|avisos diarios|recordatorios diarios|configurar avisos|configurar recordatorios|quiero configurar los recordatorios)$/.test(s) ||
      /(?:puedes|podrias) (?:recordar(?:me)?|avisar(?:me)?) (?:las citas|los trabajos|la agenda)/.test(s) ||
      /^(?:como activo los recordatorios|como activo el recordatorio de las 7|como recibir avisos diarios|como activo los avisos)$/.test(s))
    return 'reminders-info';

  if(/^(?:hoy|agenda hoy|agenda de hoy|trabajos hoy|trabajos de hoy|citas de hoy|agenda del equipo hoy|mi agenda de hoy)$/.test(s))
    return 'agenda-today';
  if(/^(?:manana|agenda manana|agenda de manana|trabajos manana|trabajos de manana|citas de manana|agenda del equipo manana|mi agenda de manana)$/.test(s))
    return 'agenda-tomorrow';
  // No confundir «quiero reservar una cita mañana» con una consulta privada del equipo.
  const askingAboutTeam=/(?:que|cuales|cuantos|ver|mostrar|muestra|muestrame|consultar|revisar|lista|listar|hay|tenemos|tengo|tienen|nos tocan|nos toca|equipo|programados|agendados)/.test(s);
  const schedulingRequest=/(?:quiero|quisiera|necesito) (?:reservar|pedir|agendar|solicitar|programar|hacer una) cita|(?:reservar|solicitar|pedir) (?:una )?cita/.test(s);
  if(!schedulingRequest && /\b(?:agenda|citas?|trabajos?|visitas?)\b/.test(s) && askingAboutTeam){
    if(/\bmanana\b/.test(s))return 'agenda-tomorrow';
    if(/\bhoy\b/.test(s))return 'agenda-today';
    if(/\bagenda\b/.test(s)&&/\b(?:mi|nuestra|del equipo)\b/.test(s))return 'agenda-today';
  }
  if(/^(?:pendientes|tickets pendientes|solicitudes pendientes|solicitudes por atender|pedidos pendientes|cuantas solicitudes hay pendientes|cuantos tickets tenemos pendientes)$/.test(s) ||
      /\b(?:solicitudes|tickets)\b.*\b(?:pendientes|por atender|por gestionar|quedan|faltan|abiertas)\b/.test(s) ||
      /\b(?:pendientes|por atender)\b.*\b(?:solicitudes|tickets)\b/.test(s))
    return 'pending';

  if(/^(?:asesor|asesoria solar|asesoramiento solar|quiero asesoramiento solar|quiero asesoria solar|quiero que me asesores|necesito asesoramiento solar|necesito un sistema solar|ayudame a calcular un sistema solar|quiero calcular mi sistema solar|orientame sobre un sistema solar|necesito energia para mi nevera y dos aires acondicionados)$/.test(s))
    return 'solar';
  if(/^(?:productos|ver productos|ver catalogo|catalogo|catalogo solar|que productos tienen|que equipos venden|quiero ver el catalogo)$/.test(s))
    return 'products';
  if(/^(?:servicios|ver servicios|que servicios ofrecen|que servicios tienen)$/.test(s))
    return 'services';
  if(/^(?:solicitar servicio|quiero solicitar servicio|pedir servicio|necesito una reparacion|quiero una visita tecnica|registrar solicitud)$/.test(s))
    return 'request-service';
  if(/^(?:hablar con una persona|hablar con asesor|hablar con un asesor|hablar con alguien|hablar con humano|necesito atencion humana|contactar al equipo|atencion al cliente|contacto|gestor comercial|hablar con ventas)$/.test(s))
    return 'human';
  return null;
}

export type TelegramReplyMarkup =
  | {keyboard:{text:string}[][];resize_keyboard:true;one_time_keyboard:true;input_field_placeholder:string}
  | {remove_keyboard:true};

const keyboard=(labels:string[][]):TelegramReplyMarkup=>({
  keyboard:labels.map(row=>row.map(text=>({text}))),
  resize_keyboard:true,one_time_keyboard:true,
  input_field_placeholder:'Escríbeme lo que necesitas…'
});

export function telegramReplyKeyboard(
  staff:boolean,
  solarStage?:SolarStage|null,
  view:'normal'|'reminders'='normal'
):TelegramReplyMarkup {
  if(view==='reminders'){
    return keyboard([
      ['✅ Activar avisos diarios','🔕 Desactivar avisos'],
      ['📅 Agenda del equipo hoy','📆 Agenda del equipo mañana']
    ]);
  }
  if(solarStage){
    const choices:Partial<Record<SolarStage,string[][]>>={
      ownership:[['No, necesito un sistema nuevo','Sí, tengo inversor']],
      sector:[['🏠 Vivienda','🏪 Negocio privado','🏢 Centro estatal']],
      level:[['Guía sencilla','Modo técnico']],
      phase:[['Monofásica','Dos líneas / 220 V','Trifásica']],
      origin:[['Ya sumé los vatios','Medí voltaje y amperios']],
      essential:[['Solo esenciales','Todos los equipos']]
    };
    return choices[solarStage]?keyboard(choices[solarStage]!):{remove_keyboard:true};
  }
  return staff
    ?keyboard([
      ['📅 Agenda del equipo hoy','📆 Agenda del equipo mañana'],
      ['📋 Solicitudes pendientes','🔔 Recordatorios'],
      ['☀️ Asesoría solar','🛍️ Ver productos'],
      ['🛠️ Servicios','✏️ Nuevo chat']
    ])
    :keyboard([
      ['☀️ Asesoría solar','🛍️ Ver productos'],
      ['🛠️ Servicios','🧾 Solicitar servicio'],
      ['🙋 Hablar con una persona','✏️ Nuevo chat']
    ]);
}
