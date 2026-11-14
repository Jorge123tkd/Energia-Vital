/**
 * Política preliminar de planificación de brigadas Bonaire (Cuba).
 * Puras/independientes: no leen D1, no reservan fechas ni envían notificaciones.
 * La API debe validar permisos, usar escritura atómica y registrar el actor.
 */
export type BrigadeDecision='scheduled'|'acknowledgement_required'|'pending_admin_approval';
export type BrigadeLoad={
  id:string;
  name:string;
  active:boolean;
  day_jobs:number;
  planned_minutes:number;
  jobs_in_period:number;
};

/** Fecha local YYYY-MM-DD para asignar la jornada completa, sin conversión a UTC. */
export function validCubanWorkDate(input:unknown):input is string{
  if(typeof input!=='string'||!/^(20\d{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input))
    return false;
  const [y,m,d]=input.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===input;
}
export function cubaToday(now:Date=new Date()):string{
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Havana',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(now);
}
/**
 * Regla aprobada por dirección:
 * 1-2 brigadas: gestor puede confirmar trabajo adicional pero debe reconocer ocupación.
 * 3+ brigadas: segundo trabajo en el mismo día queda PENDIENTE de administrador general.
 * Una fecha ocupada no significa necesariamente que no se puedan realizar dos tareas.
 */
export function decideBrigadeAssignment(
  activeBrigades:number,
  jobsOnSelectedDay:number,
  busyAcknowledged=false
):BrigadeDecision{
  if(!Number.isInteger(activeBrigades)||activeBrigades<1)
    throw Error('Debe existir al menos una brigada activa');
  if(!Number.isInteger(jobsOnSelectedDay)||jobsOnSelectedDay<0)
    throw Error('Cantidad de trabajos inválida');
  if(jobsOnSelectedDay===0)return 'scheduled';
  if(activeBrigades>2)return 'pending_admin_approval';
  return busyAcknowledged?'scheduled':'acknowledgement_required';
}
/**
 * Recomienda primero brigadas disponibles ese día; después la de menor
 * carga ESTIMADA (minutos), después menos trabajos. No asigna automáticamente.
 */
export function recommendBrigade(loads:BrigadeLoad[]):string|null{
  const active=loads.filter(x=>x.active&&Number.isFinite(x.planned_minutes)&&
    Number.isFinite(x.day_jobs)&&Number.isFinite(x.jobs_in_period));
  if(!active.length)return null;
  active.sort((a,b)=>
    Number(a.day_jobs>0)-Number(b.day_jobs>0)
    ||a.planned_minutes-b.planned_minutes
    ||a.jobs_in_period-b.jobs_in_period
    ||a.name.localeCompare(b.name,'es')
    ||a.id.localeCompare(b.id)
  );
  return active[0].id;
}
