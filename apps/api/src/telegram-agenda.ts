/** Datos operativos EXCLUSIVOS del personal cuya identidad y permiso ya están verificados. */
import type { Env } from './types';

export function cubaDate(date:Date):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Havana',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=(key:string)=>parts.find(part=>part.type===key)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
export function cubaClock(date:Date):string {
  return new Intl.DateTimeFormat('es-CU',{timeZone:'America/Havana',
    hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
export function cubaTomorrow(date:Date):string {
  const today=cubaDate(date);
  // Sumar UN DIA de calendario, no 24 horas en la zona local durante DST.
  return new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
}
export function cubaHour(date:Date):number {
  return Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Havana',
    hour:'numeric',hourCycle:'h23'}).format(date));
}
export async function pendingTicketSummary(env:Env):Promise<string> {
  const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE status='pending'").first<{n:number}>();
  return 'Bonaire registra '+(row?.n||0)+' solicitud(es) pendientes. Revisa /admin → Solicitudes para gestionarlas.';
}
export async function agendaForTeam(env:Env,when:'today'|'tomorrow',at=new Date()):Promise<string> {
  const date=when==='tomorrow'?cubaTomorrow(at):cubaDate(at);
  const lower=new Date(at.getTime()-48*3600000).toISOString();
  const upper=new Date(at.getTime()+96*3600000).toISOString();
  const rows=await env.DB.prepare(
    "SELECT a.title,a.starts_at,a.status,cu.name AS customer_name,cu.phone,cu.address,cu.city,cu.province "+
    "FROM appointments a LEFT JOIN customers cu ON cu.id=a.customer_id "+
    "WHERE a.status NOT IN ('cancelled','completed') AND a.starts_at BETWEEN ? AND ? "+
    "ORDER BY a.starts_at ASC LIMIT 300"
  ).bind(lower,upper).all<{
    title:string; starts_at:string;status:string; customer_name:string|null;
    phone:string|null;address:string|null;city:string|null;province:string|null;
  }>();
  const relevant=(rows.results||[]).filter(r=>{
    const dateTime=new Date(r.starts_at);
    return Number.isFinite(dateTime.getTime())&&cubaDate(dateTime)===date;
  });
  const label=when==='tomorrow'?'MAÑANA':'HOY';
  if(!relevant.length)return 'Agenda del EQUIPO Bonaire para '+label+' ('+date+'): no hay citas abiertas registradas.';
  const lines=relevant.slice(0,12).map((r,i)=>{
    const location=[r.address,r.city,r.province].filter(Boolean).join(', ');
    return (i+1)+'. '+cubaClock(new Date(r.starts_at))+' · '+r.title+
      '\nCliente: '+(r.customer_name||'Sin cliente asociado')+
      (location?'\nLugar: '+location:'')+
      (r.phone?'\nContacto: '+r.phone:'')+'\nEstado: '+r.status;
  });
  return 'Agenda del EQUIPO Bonaire · '+label+' ('+date+') · '+relevant.length+' cita(s) abierta(s):\n\n'+
    lines.join('\n\n')+(relevant.length>12?'\n\nHay más citas; consulta /admin.':'')+
    '\n\nImportante: esta agenda es general del equipo, NO una asignación individual de trabajos. Confirma cada cita con el cliente antes de salir.';
}
