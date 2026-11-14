<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let {token,onClose,onOpenAppointments,onOpenBrigades}:{
    token:string;onClose:()=>void;onOpenAppointments:()=>void;onOpenBrigades:()=>void
  }=$props();

  type Appointment={id:string;title:string;starts_at:string;ends_at:string;status:string;customer_name:string|null;phone:string|null};
  type DatedRequest={id:string;title:string;preferred_date:string;status:string;customer_name:string|null};
  type BrigadeWork={id:string;brigade_name:string;title:string;work_date:string;status:string;estimated_minutes:number;request_id:string};
  const zone='America/Havana';
  const df=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const cubaDate=(d:Date)=>{
    const parts=df.formatToParts(d);
    const part=(name:string)=>parts.find(p=>p.type===name)?.value||'';
    return part('year')+'-'+part('month')+'-'+part('day');
  };
  const clock=(iso:string)=>new Intl.DateTimeFormat('es-CU',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
  const dayLabel=(date:string)=>new Intl.DateTimeFormat('es-CU',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
  const today=cubaDate(new Date());
  let month=$state(today.slice(0,7)),selected=$state(today);
  let appointments:Appointment[]=$state([]),requests:DatedRequest[]=$state([]),brigadeWorks:BrigadeWork[]=$state([]);
  let loading=$state(false),error=$state(''),truncated=$state(false);
  let requestSequence=0;
  const monthTitle=$derived(new Intl.DateTimeFormat('es-CU',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(month+'-01T12:00:00Z')));
  const cells=$derived.by(()=>{
    const [y,m]=month.split('-').map(Number);
    const offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
    const count=new Date(Date.UTC(y,m,0)).getUTCDate();
    return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>{
      const d=i-offset+1;
      return {day:d>0&&d<=count?d:0,date:d>0&&d<=count?month+'-'+String(d).padStart(2,'0'):''};
    });
  });
  function appointmentsFor(day:string){return appointments.filter(a=>!Number.isNaN(Date.parse(a.starts_at))&&cubaDate(new Date(a.starts_at))===day);}
  function requestsFor(day:string){return requests.filter(r=>r.preferred_date.slice(0,10)===day);}
  function brigadeWorksFor(day:string){return brigadeWorks.filter(w=>w.work_date===day&&['scheduled','pending_approval','completed'].includes(w.status));}
  const selectedAppointments=$derived(appointmentsFor(selected));
  const selectedRequests=$derived(requestsFor(selected));
  const selectedBrigadeWorks=$derived(brigadeWorksFor(selected));

  async function loadMonth(){
    const seq=++requestSequence;
    loading=true;error='';
    try{
      const [result,works]=await Promise.all([
        api.getStaffCalendar(token,month),api.brigadeWorkMonth(token,month)
      ]);
      if(seq!==requestSequence)return;
      appointments=result.appointments||[];
      requests=result.dated_requests||[];
      brigadeWorks=works.works||[];
      truncated=Boolean(result.truncated);
    }catch(e){
      if(seq!==requestSequence)return;
      appointments=[];requests=[];brigadeWorks=[];
      error=e instanceof Error?e.message:'No se pudo cargar el calendario.';
    }finally{if(seq===requestSequence)loading=false;}
  }
  function changeMonth(delta:number){
    const [y,m]=month.split('-').map(Number);
    month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);
    selected=month+'-01';void loadMonth();
  }
  onMount(()=>{void loadMonth();});
</script>

<svelte:window onkeydown={e=>{if(e.key==='Escape')onClose();}}/>
<div class="fixed inset-0 z-[225] flex items-center justify-center p-2 sm:p-5">
  <button type="button" class="absolute inset-0 bg-slate-950/75" aria-label="Cerrar calendario" onclick={onClose}></button>
  <dialog open aria-label="Calendario del equipo de Bonaire" class="relative m-0 w-full max-w-5xl max-h-[94dvh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
    <header class="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-bold uppercase text-teal-700">Bonaire · Agenda del equipo</p>
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">Calendario general de Bonaire</h2>
        <p class="text-xs text-slate-500 mt-1">Hora de Cuba · Citas, solicitudes y trabajos de brigadas</p>
      </div>
      <button type="button" aria-label="Cerrar" onclick={onClose} class="rounded-xl bg-slate-100 px-3 py-2 font-bold">✕</button>
    </header>
    <div class="p-3 sm:p-6 space-y-5">
      <div class="flex flex-wrap justify-between items-center gap-3">
        <div class="flex items-center gap-2">
          <button type="button" onclick={()=>changeMonth(-1)} aria-label="Mes anterior" class="w-11 h-11 rounded-xl border border-slate-200 text-xl font-bold">‹</button>
          <h3 class="capitalize min-w-32 text-center text-base sm:text-lg font-extrabold text-slate-800">{monthTitle}</h3>
          <button type="button" onclick={()=>changeMonth(1)} aria-label="Mes siguiente" class="w-11 h-11 rounded-xl border border-slate-200 text-xl font-bold">›</button>
        </div>
        <button type="button" onclick={()=>{month=today.slice(0,7);selected=today;void loadMonth();}} class="rounded-xl border border-teal-200 px-3 py-2 font-bold text-sm text-teal-800">Hoy</button>
      </div>
      <div class="flex flex-wrap gap-3 text-xs text-slate-600">
        <span><span class="inline-block w-2 h-2 bg-teal-700 rounded-full mr-1"></span>Citas</span>
        <span><span class="inline-block w-2 h-2 bg-amber-500 rounded-full mr-1"></span>Solicitudes con fecha indicada</span>
        <span><span class="inline-block w-2 h-2 bg-indigo-600 rounded-full mr-1"></span>Trabajos de brigadas</span>
      </div>
      {#if loading}<p role="status" class="text-sm text-slate-500">Cargando agenda…</p>{/if}
      {#if error}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>{/if}
      {#if truncated}<p role="alert" class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Hay más registros de los que muestra la vista rápida. Consulta los listados del panel.</p>{/if}
      <div class="grid grid-cols-7 gap-1 sm:gap-2" aria-label={'Días de '+monthTitle}>
        {#each ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'] as weekday}
          <div class="text-center text-xs font-bold text-slate-500 py-2">{weekday}</div>
        {/each}
        {#each cells as cell,index (index)}
          {#if cell.date}
            {@const a=appointmentsFor(cell.date).length}
            {@const r=requestsFor(cell.date).length}
            {@const b=brigadeWorksFor(cell.date).length}
            <button type="button" onclick={()=>selected=cell.date}
              aria-pressed={selected===cell.date}
              aria-label={cell.date+': '+a+' citas, '+r+' solicitudes con fecha, '+b+' trabajos de brigadas'}
              class="min-h-14 sm:min-h-20 rounded-xl border p-1 sm:p-2 text-left {selected===cell.date?'border-teal-700 bg-teal-50 ring-1 ring-teal-700':'border-slate-200 hover:bg-slate-50'}">
              <span class="block text-xs sm:text-sm font-bold text-slate-800">{cell.day}</span>
              <span class="flex gap-1 flex-wrap mt-1">
                {#if a}<span title="Citas" class="rounded bg-teal-700 text-white text-[10px] px-1.5 py-0.5">{a}</span>{/if}
                {#if r}<span title="Fechas indicadas" class="rounded bg-amber-100 text-amber-900 text-[10px] px-1.5 py-0.5">{r}</span>{/if}
                {#if b}<span title="Trabajos de brigadas" class="rounded bg-indigo-600 text-white text-[10px] px-1.5 py-0.5">{b}</span>{/if}
              </span>
            </button>
          {:else}
            <span class="bg-slate-50 rounded-xl" aria-hidden="true"></span>
          {/if}
        {/each}
      </div>
      <section class="border-t border-slate-200 pt-5 space-y-4" aria-live="polite">
        <h3 class="text-lg font-extrabold text-slate-900 capitalize">{dayLabel(selected)}</h3>
        {#if !loading&&!error&&!selectedAppointments.length&&!selectedRequests.length&&!selectedBrigadeWorks.length}
          <p class="text-sm text-slate-500">Sin citas, solicitudes ni trabajos de brigadas para este día.</p>
        {/if}
        {#if selectedAppointments.length}
          <div class="space-y-2">
            <h4 class="font-bold text-teal-800">Citas ({selectedAppointments.length})</h4>
            {#each selectedAppointments as appointment (appointment.id)}
              <article class="rounded-xl border border-teal-100 bg-teal-50/40 p-3 space-y-1 text-sm">
                <div class="flex flex-wrap justify-between gap-2">
                  <strong class="text-slate-900">{clock(appointment.starts_at)}–{clock(appointment.ends_at)} · {appointment.title}</strong>
                  <span class="rounded-full bg-white border border-teal-200 px-2 py-1 text-xs">{appointment.status}</span>
                </div>
                <p>Cliente: {appointment.customer_name||'Sin cliente asociado'}{appointment.phone?' · '+appointment.phone:''}</p>
                <p class="text-xs text-slate-500 break-all">Ref. {appointment.id}</p>
              </article>
            {/each}
          </div>
        {/if}
        {#if selectedRequests.length}
          <div class="space-y-2">
            <h4 class="font-bold text-amber-900">Solicitudes con fecha ({selectedRequests.length})</h4>
            {#each selectedRequests as request (request.id)}
              <article class="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-1 text-sm">
                <div class="flex flex-wrap justify-between gap-2">
                  <strong>{request.title}</strong><span class="bg-white border border-amber-200 rounded-full px-2 py-1 text-xs">{request.status}</span>
                </div>
                <p>Cliente: {request.customer_name||'Sin cliente vinculado'}</p>
                <p class="text-xs text-amber-900">Fecha indicada, no confirma visita ni asignación de técnico.</p>
                <p class="text-xs text-slate-500 break-all">Ref. {request.id}</p>
              </article>
            {/each}
          </div>
        {/if}
        {#if selectedBrigadeWorks.length}
          <div class="space-y-2">
            <h4 class="font-bold text-indigo-900">Brigadas ({selectedBrigadeWorks.length})</h4>
            {#each selectedBrigadeWorks as w (w.id)}
              <article class="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-1 text-sm">
                <div class="flex flex-wrap justify-between gap-2">
                  <strong>{w.brigade_name} · {w.title}</strong>
                  <span class="bg-white border border-indigo-200 rounded-full px-2 py-1 text-xs">
                    {w.status==='scheduled'?'Programado':w.status==='pending_approval'?'Pendiente de autorización':'Completado'}
                  </span>
                </div>
                <p class="text-xs text-slate-600">Duración estimada: {w.estimated_minutes/60} h · Ref. {w.request_id}</p>
                {#if w.status==='pending_approval'}
                  <p class="text-xs text-amber-900 font-semibold">Aún no es una asignación confirmada.</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
        <p class="text-xs text-slate-500">Las citas muestran horarios confirmados; una solicitud con fecha preferida no confirma un trabajo. La agenda de brigadas usa jornadas y duración estimada.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick={()=>{onClose();onOpenAppointments();}} class="rounded-xl bg-teal-700 text-white font-bold px-4 py-3 text-sm">Administrar citas</button>
          <button type="button" onclick={()=>{onClose();onOpenBrigades();}} class="rounded-xl border border-indigo-200 text-indigo-800 font-bold px-4 py-3 text-sm">Administrar brigadas</button>
        </div>
      </section>
    </div>
  </dialog>
</div>
