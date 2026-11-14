<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';

  type Availability={id:string;name:string;active:boolean;day_jobs:number;planned_minutes:number;jobs_in_period:number};
  type Work={id:string;brigade_id:string;brigade_name:string;request_id:string;title:string;
    work_date:string;estimated_minutes:number;status:string;requested_by_email?:string|null;
    reviewed_by_email?:string|null;review_reason?:string|null;created_at?:string};
  let {token,canApprove,prefillRequestId=''}:{
    token:string;canApprove:boolean;prefillRequestId?:string;
  }=$props();
  const zone='America/Havana';
  const dateParts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  const cubaDate=(d:Date)=>{
    const parts=dateParts.formatToParts(d);
    const f=(t:string)=>parts.find(x=>x.type===t)?.value||'';
    return f('year')+'-'+f('month')+'-'+f('day');
  };
  const today=cubaDate(new Date());
  let month=$state(today.slice(0,7)),date=$state(today);
  let requestId=$state(prefillRequestId);
  let brigadeId=$state(''),hours=$state(8),acknowledged=$state(false),cancelReason=$state('');
  let reviewReason=$state('');
  let loads:Availability[]=$state([]),suggested=$state<string|null>(null),activeCount=$state(0);
  let works:Work[]=$state([]),approvals:Work[]=$state([]);
  let loading=$state(false),availabilityLoading=$state(false),busy=$state(false);
  let error=$state(''),success=$state(''),truncated=$state(false);
  let seq=0;
  const labels:Record<string,string>={
    scheduled:'Programado',pending_approval:'Pendiente de administrador',
    rejected:'Rechazado',cancelled:'Cancelado',completed:'Completado'
  };
  const statusClass:Record<string,string>={
    scheduled:'bg-teal-50 text-teal-800',pending_approval:'bg-amber-50 text-amber-900',
    rejected:'bg-red-50 text-red-800',cancelled:'bg-slate-100 text-slate-600',
    completed:'bg-emerald-50 text-emerald-800'
  };
  const selectedDayWorks=$derived(works.filter(w=>w.work_date===date));
  const chosen=$derived(loads.find(b=>b.id===brigadeId));
  const recommended=$derived(loads.find(b=>b.id===suggested));
  const monthTitle=$derived(new Intl.DateTimeFormat('es-CU',{timeZone:'UTC',month:'long',year:'numeric'})
    .format(new Date(month+'-01T12:00:00Z')));
  const days=$derived.by(()=>{
    const [year,m]=month.split('-').map(Number);
    const offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
    const count=new Date(Date.UTC(year,m,0)).getUTCDate();
    return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>{
      const day=i-offset+1;
      return {day:day>=1&&day<=count?day:0,date:day>=1&&day<=count?month+'-'+String(day).padStart(2,'0'):''};
    });
  });

  $effect(()=>{if(prefillRequestId)requestId=prefillRequestId;});

  async function refreshMonth(){
    loading=true;
    try{
      const results=await Promise.all([
        api.brigadeWorkMonth(token,month),
        canApprove?api.pendingBrigadeApprovals(token):Promise.resolve({pending:[]})
      ]);
      works=results[0].works||[];
      approvals=results[1].pending||[];
      truncated=Boolean(results[0].truncated);
    }catch(e){error=e instanceof Error?e.message:'No se pudo cargar la agenda de brigadas.';}
    finally{loading=false;}
  }
  async function loadAvailability(){
    const current=++seq;
    availabilityLoading=true;
    try{
      const result=await api.brigadeAvailability(token,date);
      if(current!==seq)return;
      loads=result.brigades||[];
      suggested=result.recommended_brigade_id||null;
      activeCount=result.active_count||0;
      if(!loads.some(x=>x.id===brigadeId))brigadeId=suggested||'';
      acknowledged=false;
    }catch(e){if(current===seq){loads=[];activeCount=0;error=e instanceof Error?e.message:'No se pudo consultar la disponibilidad.';}}
    finally{if(current===seq)availabilityLoading=false;}
  }
  function pickDay(next:string){
    date=next;acknowledged=false;error='';success='';
    void loadAvailability();
  }
  function moveMonth(delta:number){
    const [year,m]=month.split('-').map(Number);
    const next=new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);
    month=next;date=next+'-01';error='';success='';
    void refreshMonth();void loadAvailability();
  }
  async function refresh(){
    error='';
    await Promise.all([refreshMonth(),loadAvailability()]);
  }
  onMount(()=>{void refresh();});

  async function assign(e:SubmitEvent){
    e.preventDefault();
    if(busy||availabilityLoading||date<today||!brigadeId)return;
    busy=true;error='';success='';
    try{
      const response=await api.assignBrigadeWork(token,{
        brigade_id:brigadeId,request_id:requestId.trim(),work_date:date,
        estimated_minutes:Math.round(hours*60),busy_acknowledged:acknowledged
      });
      success=response.message||'Solicitud de trabajo registrada.';
      requestId='';acknowledged=false;
      await refresh();
    }catch(err){error=err instanceof Error?err.message:'No se pudo asignar el trabajo.';}
    finally{busy=false;}
  }
  async function review(w:Work,decision:'approve'|'reject'){
    if(busy)return;
    if(decision==='reject'&&reviewReason.trim().length<3){
      error='Escribe un motivo de rechazo antes de continuar.';return;
    }
    if(!window.confirm((decision==='approve'?'¿Autorizar':'¿Rechazar')+
      ' el trabajo adicional para «'+w.brigade_name+'» el '+w.work_date+'?'))return;
    busy=true;error='';success='';
    try{
      const r=await api.reviewBrigadeWork(token,w.id,decision,reviewReason.trim());
      success=r.message||'Autorización registrada.';reviewReason='';
      await refresh();
    }catch(err){error=err instanceof Error?err.message:'No se pudo revisar el trabajo.';}
    finally{busy=false;}
  }
  async function cancel(w:Work){
    if(busy||!window.confirm('¿Cancelar este trabajo? Quedará registrado en el historial.'))return;
    busy=true;error='';success='';
    try{
      const r=await api.cancelBrigadeWork(token,w.id,cancelReason.trim());
      success=r.message||'Trabajo cancelado.';cancelReason='';
      await refresh();
    }catch(err){error=err instanceof Error?err.message:'No se pudo cancelar el trabajo.';}
    finally{busy=false;}
  }
</script>

<section class="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
  <div class="flex flex-wrap justify-between items-start gap-3">
    <div>
      <h3 class="text-xl font-extrabold text-slate-900">Calendario y asignaciones</h3>
      <p class="text-sm text-slate-600 mt-1">Los gestores asignan trabajos a brigadas; las fechas corresponden a Cuba.</p>
    </div>
    <button type="button" onclick={refresh} disabled={busy||loading}
      class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold">↻ Actualizar</button>
  </div>

  {#if error}<p role="alert" class="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>{/if}
  {#if success}<p role="status" class="rounded-xl bg-teal-50 border border-teal-200 p-3 text-sm text-teal-800">{success}</p>{/if}
  {#if truncated}<p class="text-sm text-amber-900">Hay más de 500 trabajos en este mes; la agenda rápida no muestra todos. Consulta al administrador.</p>{/if}

  {#if canApprove && approvals.length}
    <div class="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
      <h4 class="font-extrabold text-amber-950">Pendientes de aprobación del administrador ({approvals.length})</h4>
      <p class="text-xs text-amber-900">Son segundos trabajos en un mismo día cuando hay más de dos brigadas. No están confirmados.</p>
      <label class="block text-sm font-semibold text-amber-950">Motivo de la decisión (obligatorio si rechazas)
        <textarea bind:value={reviewReason} maxlength="500" rows="2" class="block w-full rounded-lg border border-amber-300 p-2 mt-1" placeholder="Explica la decisión si es necesario"></textarea>
      </label>
      {#each approvals as w (w.id)}
        <article class="rounded-xl bg-white border border-amber-200 p-3 space-y-2">
          <p class="font-semibold text-sm">{w.work_date} · {w.brigade_name} · {w.title}</p>
          <p class="text-xs text-slate-600">Solicitado por {w.requested_by_email||'Personal'} · duración estimada {w.estimated_minutes/60} h</p>
          <div class="flex gap-2 flex-wrap">
            <button type="button" onclick={()=>review(w,'approve')} disabled={busy}
              class="rounded-lg bg-teal-700 text-white font-bold text-xs px-3 py-2">Autorizar</button>
            <button type="button" onclick={()=>review(w,'reject')} disabled={busy}
              class="rounded-lg border border-red-300 text-red-800 font-bold text-xs px-3 py-2">Rechazar</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <button type="button" onclick={()=>moveMonth(-1)} aria-label="Mes anterior" class="rounded-lg border px-3 py-2">‹</button>
      <h4 class="capitalize min-w-36 text-center font-extrabold">{monthTitle}</h4>
      <button type="button" onclick={()=>moveMonth(1)} aria-label="Mes siguiente" class="rounded-lg border px-3 py-2">›</button>
    </div>
    <button type="button" onclick={()=>{month=today.slice(0,7);date=today;void refresh();}}
      class="rounded-lg border border-teal-200 text-teal-800 font-bold px-3 py-2 text-sm">Hoy</button>
  </div>
  <div class="grid grid-cols-7 gap-1" aria-label="Días con trabajos de brigadas">
    {#each ['L','M','X','J','V','S','D'] as heading}
      <span class="text-xs text-slate-500 font-bold text-center py-2">{heading}</span>
    {/each}
    {#each days as cell,i (i)}
      {#if cell.date}
        {@const booked=works.filter(w=>w.work_date===cell.date&&w.status==='scheduled').length}
        {@const waiting=works.filter(w=>w.work_date===cell.date&&w.status==='pending_approval').length}
        <button type="button" onclick={()=>pickDay(cell.date)} aria-pressed={date===cell.date}
          class="min-h-12 sm:min-h-14 rounded-xl text-left border px-1.5 py-2 {date===cell.date?'border-teal-700 bg-teal-50':'border-slate-200 hover:bg-slate-50'}">
          <span class="font-bold text-sm">{cell.day}</span>
          <span class="flex flex-wrap gap-0.5 mt-0.5">
            {#if booked}<span class="bg-teal-700 text-white text-[10px] rounded px-1">{booked}</span>{/if}
            {#if waiting}<span class="bg-amber-100 text-amber-900 text-[10px] rounded px-1">{waiting}?</span>{/if}
          </span>
        </button>
      {:else}
        <span class="bg-slate-50 rounded-xl" aria-hidden="true"></span>
      {/if}
    {/each}
  </div>

  <div class="rounded-xl border border-slate-200 p-3 space-y-3">
    <h4 class="font-extrabold">Trabajos del día {date}</h4>
    {#if loading}<p class="text-sm text-slate-500">Cargando…</p>{/if}
    {#if !selectedDayWorks.length && !loading}<p class="text-sm text-slate-500">No hay trabajos registrados para esta fecha.</p>{/if}
    {#each selectedDayWorks as w (w.id)}
      <article class="border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 justify-between">
        <div class="space-y-1">
          <p class="font-bold text-sm">{w.brigade_name} · {w.title}</p>
          <p class="text-xs text-slate-600">Referencia: {w.request_id} · {w.estimated_minutes/60} h estimadas</p>
          <p class="text-xs text-slate-500">Gestor: {w.requested_by_email||'Sin nombre disponible'}</p>
          {#if w.reviewed_by_email}<p class="text-xs text-slate-500">Revisó: {w.reviewed_by_email}</p>{/if}
          {#if w.review_reason}<p class="text-xs text-slate-600">Motivo: {w.review_reason}</p>{/if}
        </div>
        <div class="space-y-2">
          <span class="block rounded-lg px-2 py-1 text-xs font-semibold {statusClass[w.status]||'bg-slate-100'}">
            {labels[w.status]||w.status}
          </span>
          {#if w.status==='scheduled'||w.status==='pending_approval'}
            <button type="button" onclick={()=>cancel(w)} disabled={busy}
              class="text-xs border border-red-200 text-red-800 rounded-lg px-2 py-1">Cancelar</button>
          {/if}
        </div>
      </article>
    {/each}
  </div>

  <form class="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-3" onsubmit={assign}>
    <h4 class="font-extrabold text-teal-950">Asignar trabajo a una brigada</h4>
    <p class="text-xs text-slate-600">Solo se admiten solicitudes existentes y abiertas. Esta asignación no cambia el estado ni las citas del cliente.</p>
    <label class="block text-sm font-semibold">ID completo de la solicitud
      <input type="text" required minlength="4" maxlength="96" bind:value={requestId} placeholder="Copia el ID desde Solicitudes"
        class="block w-full mt-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"/>
    </label>
    <label class="block text-sm font-semibold">Fecha del trabajo (Cuba)
      <input type="date" required min={today} bind:value={date}
        onchange={()=>{month=date.slice(0,7);void refresh();}}
        class="block w-full mt-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"/>
    </label>
    <label class="block text-sm font-semibold">Brigada
      <select required bind:value={brigadeId} disabled={availabilityLoading||!loads.length}
        onchange={()=>acknowledged=false} class="block w-full mt-1 border border-slate-300 bg-white rounded-xl px-3 py-2.5 text-sm">
        <option value="">Selecciona una brigada</option>
        {#each loads as b (b.id)}
          <option value={b.id}>{b.name} · {b.day_jobs?'Ocupada ('+b.day_jobs+')':'Disponible'}</option>
        {/each}
      </select>
    </label>
    {#if availabilityLoading}<p class="text-xs">Consultando ocupación…</p>{/if}
    {#if recommended}
      <p class="text-xs text-teal-800">Recomendación: {recommended.name} (se prioriza fecha libre y carga acumulada). Puedes elegir otra.</p>
    {/if}
    {#if chosen && chosen.day_jobs>0}
      <p class="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
        <strong>{chosen.name} está ocupada este día.</strong>
        {activeCount>2
          ?'Si envías esta segunda asignación, quedará PENDIENTE de aprobación del administrador general.'
          :'Con una o dos brigadas, puedes asignar otro trabajo solo tras confirmar que es viable.'}
      </p>
      {#if activeCount<=2}
        <label class="flex items-start gap-2 text-sm text-amber-950">
          <input type="checkbox" bind:checked={acknowledged} class="mt-1"/>
          Confirmo que revisé la ocupación y puedo coordinar ambos trabajos sin afectar los compromisos.
        </label>
      {/if}
    {/if}
    <label class="block text-sm font-semibold">Duración estimada (horas)
      <input type="number" required min="0.5" max="24" step="0.5" bind:value={hours}
        class="block w-full mt-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"/>
    </label>
    <button type="submit" disabled={busy||loading||availabilityLoading||!brigadeId||date<today||!!(chosen&&chosen.day_jobs>0&&activeCount<=2&&!acknowledged)}
      class="w-full rounded-xl bg-teal-700 text-white font-bold px-4 py-3 disabled:opacity-50">
      {busy?'Registrando…':chosen?.day_jobs&&activeCount>2?'Solicitar aprobación del administrador':'Confirmar asignación'}
    </button>
    <p class="text-xs text-slate-500">Una fecha ocupada significa que ya tiene trabajo ese día, no que todo el horario esté ocupado. El gestor comprueba la viabilidad. Los cambios quedan auditados.</p>
  </form>
  <label class="block text-xs text-slate-500">Motivo opcional para cancelar un trabajo
    <input type="text" maxlength="500" bind:value={cancelReason} class="block w-full rounded-lg border border-slate-200 p-2 mt-1"/>
  </label>
</section>
