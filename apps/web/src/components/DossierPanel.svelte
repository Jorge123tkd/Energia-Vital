<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';

  type Customer={id:string;name:string;email?:string;phone?:string;address?:string;city?:string;
    province?:string;is_active?:number;created_at?:string};
  type Request={id:string;customer_id?:string|null;title:string;description?:string;status:string;
    type?:string;priority?:string;location?:string;preferred_date?:string;created_at?:string;
    available_budget_usd_cents?:number|null;payment_method?:string|null;
    payment_currency?:string|null;customer_type?:string|null;customer_name?:string|null;
    customer_email?:string|null;customer_phone?:string|null;image_count?:number};
  type Activity={id:string;request_id:string;request_title?:string;actor_email:string;
    activity_type:string;note:string;next_step?:string|null;follow_up_date?:string|null;created_at:string};
  type Work={id:string;request_id?:string;brigade_name:string;title:string;work_date:string;
    status:string;estimated_minutes:number;requested_by_email?:string|null;
    reviewed_by_email?:string|null};
  type Appointment={id:string;request_id?:string;title:string;starts_at:string;ends_at:string;status:string};
  type Audit={id:string;action:string;created_at:string;actor_email?:string|null};

  let {token,customerId='',requestId='',onClose}:{
    token:string;customerId?:string;requestId?:string;onClose:()=>void;
  }=$props();
  let currentRequestId=$state(requestId);
  let customerData:{customer:Customer;requests:Request[];appointments:Appointment[];
    activities:Activity[];works:Work[];assistant_conversations_count:number;
    truncated:Record<string,boolean>}|null=$state(null);
  let requestData:{request:Request;activities:Activity[];appointments:Appointment[];
    works:Work[];audit:Audit[];truncated:Record<string,boolean>}|null=$state(null);
  let busy=$state(false),loading=$state(false),error=$state(''),success=$state('');
  let kind:'call'|'whatsapp'|'visit'|'follow_up'|'internal_note'=$state('call');
  let note=$state(''),nextStep=$state(''),followUpDate=$state('');
  let serial=0;
  const labels:Record<string,string>={call:'Llamada',whatsapp:'WhatsApp',
    visit:'Visita',follow_up:'Seguimiento',internal_note:'Nota interna'};
  const status:Record<string,string>={pending:'Pendiente',quoted:'Presupuestada',
    approved:'Aprobada',scheduled:'Programada',completed:'Completada',
    cancelled:'Cancelada',pending_approval:'Pendiente de autorización',rejected:'Rechazada',
    confirmed:'Confirmada',in_progress:'En ejecución'};
  const cash=(cents:number|null|undefined)=>
    cents===null||cents===undefined?'No declarado':new Intl.NumberFormat('es-CU',{
      minimumFractionDigits:2,maximumFractionDigits:2
    }).format(cents/100)+' USD de referencia (declarados, NO verificados)';
  const when=(d?:string|null)=>d?String(d).replace('T',' ').slice(0,16):'Sin fecha';
  const idShort=(id:string)=>id.slice(0,10).toUpperCase();
  async function load(){
    const s=++serial;
    loading=true;error='';
    try{
      if(currentRequestId){
        const r=await api.getRequestDossier(token,currentRequestId);
        if(s!==serial)return;
        requestData=r;
      }else if(customerId){
        const r=await api.getCustomerDossier(token,customerId);
        if(s!==serial)return;
        customerData=r;
      }else{error='No se recibió el identificador del expediente.';}
    }catch(e){if(s===serial)error=e instanceof Error?e.message:'No se pudo consultar el expediente.';}
    finally{if(s===serial)loading=false;}
  }
  function viewRequest(id:string){
    currentRequestId=id;requestData=null;success='';void load();
  }
  function back(){
    currentRequestId='';requestData=null;success='';void load();
  }
  async function saveActivity(e:SubmitEvent){
    e.preventDefault();
    if(busy||!currentRequestId)return;
    busy=true;error='';success='';
    try{
      await api.logRequestActivity(token,currentRequestId,{
        activity_type:kind,note:note.trim(),next_step:nextStep.trim()||undefined,
        follow_up_date:followUpDate||undefined
      });
      success='Gestión registrada con el usuario que la realizó.';
      note='';nextStep='';followUpDate='';await load();
    }catch(e){error=e instanceof Error?e.message:'No se pudo registrar la gestión.';}
    finally{busy=false;}
  }
  onMount(()=>{void load();});
</script>

<svelte:window onkeydown={e=>{if(e.key==='Escape')onClose();}}/>
<div class="fixed inset-0 z-[240] flex items-center justify-center p-2 sm:p-5">
  <button type="button" class="absolute inset-0 bg-slate-950/75"
    aria-label="Cerrar expediente" onclick={onClose}></button>
  <dialog open aria-label="Expediente comercial privado de Bonaire"
    class="relative m-0 w-full max-w-5xl max-h-[95dvh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
    <header class="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-extrabold text-teal-700 uppercase">Administración privada · Bonaire</p>
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">
          {currentRequestId?'Expediente de solicitud':'Expediente Bonaire 360°'}
        </h2>
        <p class="text-xs text-slate-500 mt-1">Información vinculada, historial de gestores y próximos pasos; no modifica contratos ni pagos.</p>
      </div>
      <button type="button" onclick={onClose} aria-label="Cerrar"
        class="rounded-xl bg-slate-100 px-3 py-2 font-bold">✕</button>
    </header>
    <div class="p-4 sm:p-6 space-y-5">
      {#if customerId && currentRequestId}
        <button type="button" onclick={back} class="text-teal-800 font-bold text-sm underline">‹ Volver a expediente del cliente</button>
      {/if}
      {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>{/if}
      {#if success}<p role="status" class="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{success}</p>{/if}
      {#if loading}<p role="status" class="text-sm text-slate-600">Consultando expediente…</p>{/if}

      {#if !currentRequestId && customerData}
        <section class="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
          <div class="flex flex-wrap items-center gap-3 justify-between">
            <h3 class="text-lg font-extrabold">{customerData.customer.name}</h3>
            <span class="text-xs rounded-full px-2 py-1 font-bold {customerData.customer.is_active?'bg-teal-50 text-teal-800':'bg-red-50 text-red-800'}">
              {customerData.customer.is_active?'Cuenta activa':'Cuenta bloqueada'}
            </span>
          </div>
          <p class="text-sm break-words">Correo: {customerData.customer.email||'No registrado'} · Teléfono: {customerData.customer.phone||'No registrado'}</p>
          <p class="text-sm">Dirección: {[customerData.customer.address,customerData.customer.city,customerData.customer.province].filter(Boolean).join(', ')||'No registrada'}</p>
          <p class="text-xs text-slate-500">Ref. {customerData.customer.id}</p>
        </section>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          {#each [
            ['Solicitudes',customerData.requests.length],
            ['Citas',customerData.appointments.length],
            ['Trabajos de brigada',customerData.works.length],
            ['Conversaciones vinculadas',customerData.assistant_conversations_count]
          ] as item}
            <div class="rounded-xl bg-teal-50 border border-teal-100 p-3">
              <p class="text-xs text-teal-800">{item[0]}</p><p class="text-2xl font-extrabold text-teal-950">{item[1]}</p>
            </div>
          {/each}
        </div>
        <p class="text-xs text-slate-500">Las conversaciones del asistente se contabilizan por identidad vinculada. Su contenido privado no se muestra en este expediente.</p>
        <section class="space-y-2">
          <h3 class="font-extrabold text-lg">Solicitudes del cliente</h3>
          {#each customerData.requests as r (r.id)}
            <article class="rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-1 min-w-0">
                <p class="font-semibold text-sm">{r.title}</p>
                <p class="text-xs text-slate-600">Estado: {status[r.status]||r.status} · Ref. {idShort(r.id)}</p>
                <p class="text-xs text-slate-500">Presupuesto: {cash(r.available_budget_usd_cents)}</p>
              </div>
              <button type="button" onclick={()=>viewRequest(r.id)}
                class="rounded-lg bg-teal-700 text-white font-bold text-xs px-3 py-2">Abrir expediente</button>
            </article>
          {:else}<p class="text-sm text-slate-500">No hay solicitudes vinculadas a esta cuenta.</p>{/each}
        </section>
        <section class="space-y-2">
          <h3 class="font-extrabold text-lg">Últimas gestiones comerciales</h3>
          {#each customerData.activities as a (a.id)}
            <div class="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1">
              <p class="text-xs font-bold text-slate-600">{when(a.created_at)} · {labels[a.activity_type]||a.activity_type} · {a.actor_email}</p>
              <p class="text-sm whitespace-pre-wrap break-words">{a.note}</p>
              <p class="text-xs text-slate-600">Solicitud: {a.request_title||idShort(a.request_id)}</p>
              {#if a.next_step}<p class="text-xs text-teal-800">Próximo paso: {a.next_step}{a.follow_up_date?' · '+a.follow_up_date:''}</p>{/if}
            </div>
          {:else}<p class="text-sm text-slate-500">Todavía no hay gestiones registradas con el nuevo módulo.</p>{/each}
        </section>
        <section class="space-y-2">
          <h3 class="font-extrabold">Citas y trabajos técnicos</h3>
          {#each customerData.appointments as a (a.id)}
            <p class="text-sm border-b border-slate-100 py-2">Cita: {a.title} · {when(a.starts_at)} · {status[a.status]||a.status}</p>
          {/each}
          {#each customerData.works as w (w.id)}
            <p class="text-sm border-b border-slate-100 py-2">Brigada: {w.brigade_name} · {w.work_date} · {status[w.status]||w.status}</p>
          {/each}
        </section>
        {#if Object.values(customerData.truncated||{}).some(Boolean)}
          <p role="status" class="text-xs rounded-xl bg-amber-50 p-3 text-amber-950">El expediente muestra los 100 registros más recientes por sección. Hay más historia disponible en los listados correspondientes.</p>
        {/if}
      {/if}

      {#if currentRequestId && requestData}
        <section class="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
          <div class="flex flex-wrap justify-between gap-2 items-start">
            <h3 class="text-lg font-extrabold">{requestData.request.title}</h3>
            <span class="rounded-full bg-white border border-slate-200 px-2 py-1 text-xs font-bold">
              {status[requestData.request.status]||requestData.request.status}
            </span>
          </div>
          <p class="text-xs text-slate-500 break-all">Ref. {requestData.request.id}</p>
          <p class="text-sm">Cliente: {requestData.request.customer_name||'Contacto sin cuenta vinculada'}{requestData.request.customer_phone?' · '+requestData.request.customer_phone:''}</p>
          {#if requestData.request.customer_email}<p class="text-sm">Correo: {requestData.request.customer_email}</p>{/if}
          {#if requestData.request.location}<p class="text-sm">Lugar: {requestData.request.location}</p>{/if}
          {#if requestData.request.preferred_date}<p class="text-sm">Fecha solicitada: {requestData.request.preferred_date} (no es asignación confirmada)</p>{/if}
          <p class="text-sm whitespace-pre-wrap break-words">{requestData.request.description||'Sin descripción'}</p>
        </section>
        <section class="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          <h4 class="font-extrabold text-amber-950">Datos comerciales declarados</h4>
          <p class="text-sm">Presupuesto de referencia: {cash(requestData.request.available_budget_usd_cents)}</p>
          <p class="text-sm">Forma de pago prevista: {requestData.request.payment_method||'No indicada'} · Moneda: {requestData.request.payment_currency||'No indicada'}</p>
          <p class="text-sm">Tipo de cliente: {requestData.request.customer_type||'No declarado'}</p>
          <p class="text-xs text-amber-900">Esto no acredita fondos disponibles, impuestos aprobados, anticipo recibido ni pago verificado.</p>
        </section>
        <div class="grid sm:grid-cols-2 gap-4">
          <section class="rounded-xl border border-slate-200 p-3 space-y-2">
            <h4 class="font-extrabold">Citas vinculadas ({requestData.appointments.length})</h4>
            {#each requestData.appointments as a (a.id)}
              <p class="text-sm border-b border-slate-100 pb-2">{a.title} · {when(a.starts_at)} · {status[a.status]||a.status}</p>
            {:else}<p class="text-sm text-slate-500">Sin citas asociadas.</p>{/each}
            <p class="text-xs text-slate-500">Fotos adjuntas a la solicitud: {requestData.request.image_count||0} (se consultan desde Solicitudes).</p>
          </section>
          <section class="rounded-xl border border-slate-200 p-3 space-y-2">
            <h4 class="font-extrabold">Brigadas ({requestData.works.length})</h4>
            {#each requestData.works as w (w.id)}
              <p class="text-sm border-b border-slate-100 pb-2">{w.brigade_name} · {w.work_date} · {status[w.status]||w.status}
                {#if w.requested_by_email}<span class="block text-xs text-slate-500">Asignó: {w.requested_by_email}</span>{/if}
              </p>
            {:else}<p class="text-sm text-slate-500">Sin trabajos de brigada vinculados.</p>{/each}
          </section>
        </div>
        <section class="space-y-3">
          <h4 class="font-extrabold text-lg">Historial de intervenciones de gestores</h4>
          <p class="text-sm text-slate-600">Con uno o dos gestores, cualquiera puede atender este expediente. Cada intervención queda atribuida al usuario que la registró.</p>
          {#each requestData.activities as a (a.id)}
            <article class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <p class="text-xs font-bold text-slate-600">{when(a.created_at)} · {labels[a.activity_type]||a.activity_type} · {a.actor_email}</p>
              <p class="text-sm whitespace-pre-wrap break-words">{a.note}</p>
              {#if a.next_step}<p class="text-xs text-teal-800">Próximo paso: {a.next_step}{a.follow_up_date?' · '+a.follow_up_date:''}</p>{/if}
            </article>
          {:else}<p class="text-sm text-slate-500">No hay intervenciones registradas en la nueva bitácora.</p>{/each}
        </section>
        <form onsubmit={saveActivity} class="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <h4 class="font-extrabold text-teal-950">Registrar gestión</h4>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="block text-sm font-semibold">Tipo de gestión
              <select bind:value={kind} class="block w-full rounded-xl border border-slate-300 p-2.5 mt-1 bg-white">
                <option value="call">Llamada</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="visit">Visita</option>
                <option value="follow_up">Seguimiento</option>
                <option value="internal_note">Nota interna</option>
              </select>
            </label>
            <label class="block text-sm font-semibold">Fecha opcional de seguimiento
              <input type="date" bind:value={followUpDate} class="block w-full rounded-xl border border-slate-300 p-2.5 mt-1 bg-white"/>
            </label>
          </div>
          <label class="block text-sm font-semibold">¿Qué ocurrió?
            <textarea required minlength="3" maxlength="1500" rows="3" bind:value={note}
              placeholder="Breve resumen de la conversación o actuación"
              class="block w-full rounded-xl border border-slate-300 p-2.5 mt-1 bg-white"></textarea>
          </label>
          <label class="block text-sm font-semibold">Próximo paso (opcional)
            <input type="text" maxlength="280" bind:value={nextStep}
              placeholder="Ej.: confirmar disponibilidad de materiales"
              class="block w-full rounded-xl border border-slate-300 p-2.5 mt-1 bg-white"/>
          </label>
          <button disabled={busy||loading} type="submit"
            class="rounded-xl bg-teal-700 text-white px-4 py-2.5 font-bold disabled:opacity-50">
            {busy?'Guardando…':'Guardar intervención'}
          </button>
          <p class="text-xs text-teal-900">La cuenta de personal se asigna automáticamente. Las gestiones guardadas no se sobrescriben ni se borran; deben ser claras y verificables.</p>
        </form>
        {#if requestData.audit.length}
          <details class="border border-slate-200 rounded-xl p-3">
            <summary class="text-sm font-bold cursor-pointer">Movimientos anteriores de la solicitud ({requestData.audit.length})</summary>
            {#each requestData.audit as a (a.id)}
              <p class="text-xs text-slate-600 border-b border-slate-100 py-2">{when(a.created_at)} · {a.action} · {a.actor_email||'Sistema'}</p>
            {/each}
          </details>
        {/if}
        {#if Object.values(requestData.truncated||{}).some(Boolean)}
          <p role="status" class="text-xs rounded-xl bg-amber-50 p-3 text-amber-950">Hay más registros históricos de los que se muestran aquí; no se han eliminado.</p>
        {/if}
      {/if}
    </div>
  </dialog>
</div>
