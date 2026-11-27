/** Customer appointment requests in Cuba's local time. No automatic confirmation. */
import type {Env} from './types';
const cubaClock=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function localKey(date:Date):string{
 const p=Object.fromEntries(cubaClock.formatToParts(date).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;
}
/** Exact boundaries of a local civil day, including DST changes at midnight. */
export function cubanDayBounds(date:string):{start:string;end:string}|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const base=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,10)!==date)return null;
 const boundary=(utc:number,local:string)=>{
  let low=utc,high=utc+10*3600000;
  if(localKey(new Date(low)).slice(0,10)>=local||localKey(new Date(high)).slice(0,10)<local)throw Error('Fecha local fuera de rango');
  while(high-low>1){const mid=Math.floor((low+high)/2);if(localKey(new Date(mid)).slice(0,10)<local)low=mid;else high=mid;}
  return new Date(high).toISOString();
 };
 try{const next=base+86400000;return {start:boundary(base,date),end:boundary(next,new Date(next).toISOString().slice(0,10))};}catch{return null;}
}
export function cubanAppointmentTime(input:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input))return null;
 const base=Date.parse(input.replace(' ','T')+':00Z');
 if(!Number.isFinite(base))return null;
 // Cuba uses UTC−4 and UTC−5. Reject ambiguous or nonexistent transition times.
 const matches=[4,5].map(h=>new Date(base+h*3600000)).filter(d=>localKey(d)===input);
 return matches.length===1?matches[0]:null;
}
export async function requestTelegramAppointment(env:Env,customerId:string,chatId:string,updateId:string,input:string):Promise<string>{
 const match=/^confirmar cita (\d{4}-\d{2}-\d{2} \d{2}:\d{2})$/i.exec(input.trim());
 if(!match)return 'Para solicitar una visita de una hora, escribe «confirmar cita AAAA-MM-DD HH:mm» con la fecha y hora de Cuba. Ejemplo de formato: confirmar cita 2027-01-20 10:00. Quedará pendiente de aprobación por el equipo.';
 const starts=cubanAppointmentTime(match[1]);
 // Each update has a stable ID, even when Telegram retries delivery.
 const id='tg-cita-'+updateId;
 const prior=await env.DB.prepare("SELECT a.id FROM appointments a JOIN customers c ON c.id=a.customer_id WHERE a.id=? AND c.id=? AND c.telegram_customer_chat_id=? AND c.is_active=1").bind(id,customerId,chatId).first();
 if(prior)return 'Esta cita ya se solicitó. Referencia: '+id+'. Consulta «mis citas».';
 const now=new Date();
 if(!starts||starts<=now||starts.getTime()>now.getTime()+366*86400000)return 'Introduce una fecha futura válida en hora de Cuba, dentro de los próximos 12 meses. Evita horas ambiguas del cambio de horario.';
 const ends=new Date(starts.getTime()+3600000);
 const result=await env.DB.prepare("INSERT INTO appointments(id,customer_id,service_id,request_id,title,starts_at,ends_at,status,notes,created_at,updated_at) "+
 "SELECT ?,id,NULL,NULL,'Visita solicitada por Telegram',?,?,'pending',NULL,?,? FROM customers WHERE id=? AND telegram_customer_chat_id=? AND is_active=1 "+
 "AND NOT EXISTS(SELECT 1 FROM appointments WHERE status!='cancelled' AND starts_at<? AND ends_at>?) ON CONFLICT(id) DO NOTHING")
 .bind(id,starts.toISOString(),ends.toISOString(),now.toISOString(),now.toISOString(),customerId,chatId,ends.toISOString(),starts.toISOString()).run();
 if(!result.meta?.changes)return 'No se pudo reservar ese horario. Comprueba tu cuenta o elige otra fecha.';
 return 'Cita solicitada para '+match[1]+' (hora de Cuba). Pendiente de aprobación; no es una visita confirmada. Referencia: '+id+'.';
}


export type AppointmentDraft={date?:string;time?:string};
export function appointmentDraftReply(d:AppointmentDraft):string{
 if(!d.date)return '¿Qué día quieres la visita? Puedes decir mañana o escribir la fecha (día/mes/año).';
 if(!d.time)return '¿A qué hora de Cuba prefieres la visita? Por ejemplo, 10:00.';
 return 'Visita de una hora: '+d.date+' a las '+d.time+' (hora de Cuba). Escribe «confirmar cita» para solicitarla. Quedará pendiente de aprobación. Puedes indicar otra fecha u hora.';
}
export function advanceAppointmentDraft(input:string,prior:AppointmentDraft|null,at=new Date()):{draft:AppointmentDraft|null;reply:string;submit?:string}|null{
 const text=input.trim(),m=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const start=/^(?:solicitar cita|pedir cita|reservar cita|agendar cita|confirmar cita|quiero (?:una )?cita|(?:quiero|quisiera|necesito) (?:reservar|pedir|solicitar|agendar|programar|hacer) (?:una )?cita|quiero una visita tecnica)(?:\s|$)/.test(m);
 if(!prior&&!start)return null;
 if(/^(?:cancelar cita|cancelar borrador de cita)$/.test(m))return {draft:null,reply:'Borrador de cita cancelado. No se registró ninguna visita.'};
 if(/[¿?]/.test(text))return null;
 if(prior&&!start&&!/^(?:hoy|manana|pasado manana|(?:el )?\d|a las|cambiar (?:fecha|hora))/.test(m))return null;
 const d={...prior};
 const iso=/\b(\d{4}-\d{2}-\d{2})\b/.exec(m),slash=/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(m);
 const relative=/\b(pasado manana|manana|hoy)\b/.exec(m);
 if(iso)d.date=iso[1];
 else if(slash)d.date=slash[3]+'-'+slash[2].padStart(2,'0')+'-'+slash[1].padStart(2,'0');
 else if(relative){const offset=relative[1]==='hoy'?0:relative[1]==='manana'?1:2;d.date=new Date(Date.parse(localKey(at).slice(0,10)+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);}
 const withoutDate=m.replace(iso?.[0]||slash?.[0]||'__no_date__','');
 const hour=/(?:\ba las\s+|\b)(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/.exec(withoutDate)||/\ba las\s+(\d{1,2})(?:\s*(am|pm))?\b/.exec(withoutDate)||/^\s*(\d{1,2})(?:\s*(am|pm))?\s*$/.exec(withoutDate);
 if(hour){let h=Number(hour[1]);const colon=hour[0].includes(':'),minute=colon?Number(hour[2]):0,meridiem=colon?hour[3]:hour[2];if(meridiem){if(h<1||h>12)return {draft:d,reply:'Indica una hora válida.'};h=h%12+(meridiem==='pm'?12:0);}
 if(h>23||minute>59)return {draft:d,reply:'Indica una hora válida.'};d.time=String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0');}
 if(d.date&&d.time){const stamp=cubanAppointmentTime(d.date+' '+d.time);if(!stamp||stamp<=at||stamp.getTime()>at.getTime()+366*86400000){delete d.date;delete d.time;return {draft:d,reply:'La fecha u hora no es válida o no está en el futuro. Indica otro horario (hora de Cuba).'};}}
 if(/^confirmar cita(?:\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?$/.test(m)&&d.date&&d.time)return {draft:d,reply:'',submit:d.date+' '+d.time};
 return {draft:d,reply:appointmentDraftReply(d)};
}
