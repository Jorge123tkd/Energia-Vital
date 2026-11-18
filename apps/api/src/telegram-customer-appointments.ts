/** Customer appointment requests in Cuba's local time. No automatic confirmation. */
import type {Env} from './types';
const cubaClock=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function localKey(date:Date):string{
 const p=Object.fromEntries(cubaClock.formatToParts(date).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day+' '+p.hour+':'+p.minute;
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
 const prior=await env.DB.prepare("SELECT a.id FROM appointments a JOIN customers c ON c.id=a.customer_id WHERE a.id=? AND c.id=? AND c.telegram_chat_id=? AND c.is_active=1").bind(id,customerId,chatId).first();
 if(prior)return 'Esta cita ya se solicitó. Referencia: '+id+'. Consulta «mis citas».';
 const now=new Date();
 if(!starts||starts<=now||starts.getTime()>now.getTime()+366*86400000)return 'Introduce una fecha futura válida en hora de Cuba, dentro de los próximos 12 meses. Evita horas ambiguas del cambio de horario.';
 const ends=new Date(starts.getTime()+3600000);
 const result=await env.DB.prepare("INSERT INTO appointments(id,customer_id,service_id,request_id,title,starts_at,ends_at,status,notes,created_at,updated_at) "+
 "SELECT ?,id,NULL,NULL,'Visita solicitada por Telegram',?,?,'pending',NULL,?,? FROM customers WHERE id=? AND telegram_chat_id=? AND is_active=1 "+
 "AND NOT EXISTS(SELECT 1 FROM appointments WHERE status!='cancelled' AND starts_at<? AND ends_at>?) ON CONFLICT(id) DO NOTHING")
 .bind(id,starts.toISOString(),ends.toISOString(),now.toISOString(),now.toISOString(),customerId,chatId,ends.toISOString(),starts.toISOString()).run();
 if(!result.meta?.changes)return 'No se pudo reservar ese horario. Comprueba tu cuenta o elige otra fecha.';
 return 'Cita solicitada para '+match[1]+' (hora de Cuba). Pendiente de aprobación; no es una visita confirmada. Referencia: '+id+'.';
}
