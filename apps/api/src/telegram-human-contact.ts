/**
 * Contactos humanos publicados para Telegram; no utiliza enlaces de bots.
 * Los URL van en botones inline, no se imprimen en el texto del chat.
 */
import type { Env } from './types';
export type PublishedSalesManager={name:string;phone:string};
export type HumanContact={reply:string;buttons:Array<{text:string;url:string}>};
export function parsePublishedSalesManagers(value:unknown):PublishedSalesManager[]{
  if(typeof value!=='string')return [];
  try{
    const source:unknown=JSON.parse(value);
    if(!Array.isArray(source))return [];
    const seen=new Set<string>();
    return source.filter((m:any)=>{
      if(!m||typeof m.name!=='string'||typeof m.phone!=='string')return false;
      const name=m.name.trim(),phone=m.phone.trim(),digits=phone.replace(/\D/g,'');
      if(!name||name.length>60||!/^\+?[0-9 ()-]{8,25}$/.test(phone)||
        digits.length<8||digits.length>15||seen.has(digits))return false;
      seen.add(digits);
      return true;
    }).slice(0,6).map((m:any)=>({name:m.name.trim().replace(/[\r\n]+/g,' '),phone:m.phone.trim()}));
  }catch{return [];}
}
const greeting='Hola, deseo hablar con un gestor de Bonaire por WhatsApp para una consulta.';
export function formatHumanWhatsAppReply(value:unknown):HumanContact{
  const managers=parsePublishedSalesManagers(value);
  if(!managers.length)return {
    reply:'Por el momento Bonaire no tiene gestores de atención humana por WhatsApp publicados. '+
      'No te enviaré a otro bot ni inventaré un número. Inténtalo de nuevo más adelante.',
    buttons:[]
  };
  return {
    reply:managers.length===1
      ?'¡Claro! 💬 Toca el botón del gestor de Bonaire para abrir su WhatsApp:'
      :'¡Claro! 💬 Elige uno de los gestores de Bonaire y toca su botón de WhatsApp:',
    buttons:managers.map(m=>({
      text:'💬 '+m.name,
      url:'https://wa.me/'+m.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(greeting)
    }))
  };
}
export async function humanWhatsAppReply(db:Env['DB']):Promise<HumanContact>{
  try{
    const row=await db.prepare("SELECT value FROM system_settings WHERE key='sales_managers' LIMIT 1")
      .first<{value:string}>();
    return formatHumanWhatsAppReply(row?.value);
  }catch{
    return {
      reply:'Ahora mismo no puedo consultar los WhatsApp de los gestores de Bonaire. '+
        'Inténtalo de nuevo más adelante; no te enviaré a un bot por error.',
      buttons:[]
    };
  }
}
