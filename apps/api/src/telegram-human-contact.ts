/**
 * Contacto HUMANO de gestores de Bonaire para clientes del asistente Telegram.
 * Comparte exclusivamente los gestores publicados en la configuración comercial.
 */
import type { Env } from './types';
export type PublishedSalesManager={name:string;phone:string};

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
export function formatHumanWhatsAppReply(value:unknown):string{
  const managers=parsePublishedSalesManagers(value);
  if(!managers.length){
    return 'Por el momento Bonaire no tiene gestores de atención humana por WhatsApp publicados. '+
      'No te enviaré a otro bot ni inventaré un número. Inténtalo de nuevo más adelante.';
  }
  const contacts=managers.map((manager,index)=>{
    const url='https://wa.me/'+manager.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(greeting);
    return (managers.length>1?(index+1)+'. ':'')+manager.name+'\n'+url;
  });
  return (managers.length===1
      ?'Para hablar con una persona de Bonaire, escribe directamente a este gestor por WhatsApp:\n\n'
      :'Para hablar con una persona de Bonaire, elige uno de nuestros gestores por WhatsApp:\n\n')+
    contacts.join('\n\n')+
    '\n\nEstos enlaces son de gestores humanos, no del asistente automático.';
}
export async function humanWhatsAppReply(db:Env['DB']):Promise<string>{
  try{
    const row=await db.prepare("SELECT value FROM system_settings WHERE key='sales_managers' LIMIT 1")
      .first<{value:string}>();
    return formatHumanWhatsAppReply(row?.value);
  }catch{
    return 'Ahora mismo no puedo consultar los WhatsApp de los gestores de Bonaire. '+
      'Inténtalo de nuevo más adelante; no te enviaré a un bot por error.';
  }
}
