<script lang="ts">
  import {onMount} from 'svelte';
  import {api} from '../lib/api';
  import Pagination from './Pagination.svelte';
  type Summary={users:number;conversations:number;messages:number;returning_users:number};
  type Usage={customer_id:string;name:string;email:string|null;phone:string|null;is_active:number;conversations:number;messages:number;first_activity:string;last_activity:string};
  type Visitor={chat_id:string;display_name:string|null;username:string|null;conversations:number;messages:number;first_activity:string;last_activity:string};
  let visitors:Visitor[]=$state([]),scope=$state<'web'|'telegram-visitors'>('web');
  let {token,onCustomer}:{token:string;onCustomer:(id:string)=>void}=$props();
  let summary:Summary=$state({users:0,conversations:0,messages:0,returning_users:0});
  let users:Usage[]=$state([]),period=$state('all'),query=$state(''),appliedQuery=$state(''),page=$state(1),pageSize=$state(15);
  let loading=$state(true),error=$state(''),loaded=$state(false);
  let sequence=0;
  const periods=[{id:'all',label:'Todo el historial'},{id:'7',label:'Últimos 7 días'},{id:'30',label:'Últimos 30 días'},{id:'90',label:'Últimos 90 días'}];
  const fmt=(n:number)=>n.toLocaleString('es-CU');
  const date=(value:string)=>new Date(value).toLocaleString('es-CU',{timeZone:'America/Havana',dateStyle:'short',timeStyle:'short'});
  async function load(next=1){
    const seq=++sequence;loading=true;error='';
    try{
      const response=await api.getAssistantUsage(token,period,appliedQuery,next,scope);
      if(seq!==sequence)return;
      summary=response.summary;
      if(scope==='web'){users=response.users||[];visitors=[];}else{visitors=response.users||[];users=[];}
      page=response.page;pageSize=response.page_size;loaded=true;
      const last=Math.max(1,Math.ceil(summary.users/pageSize));
      if(page>last){void load(last);return;}
    }catch(e){if(seq===sequence){error=e instanceof Error?e.message:'No se pudo consultar la actividad.';loaded=false;users=[];visitors=[];}}
    finally{if(seq===sequence)loading=false;}
  }
  function changeScope(next:'web'|'telegram-visitors'){if(next===scope)return;scope=next;loaded=false;users=[];visitors=[];query='';appliedQuery='';void load(1);}
  function search(e:SubmitEvent){e.preventDefault();appliedQuery=query.trim();void load(1);}
  function setPeriod(e:Event){period=(e.currentTarget as HTMLSelectElement).value;void load(1);}
  onMount(()=>{void load();return ()=>{sequence++;};});
</script>

<section class="space-y-5">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs uppercase tracking-widest font-bold text-teal-700">Estadísticas · Canales separados</p>
      <h2 class="text-2xl sm:text-3xl font-bold text-slate-900">Actividad del asistente</h2>
      <p class="text-sm text-slate-600 mt-2">Consulta el uso de cada canal sin mezclar clientes registrados y visitantes del chatbot de Telegram.</p>
    </div>
    <button type="button" onclick={()=>load(page)} disabled={loading} class="rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 disabled:opacity-50">Actualizar</button>
  </header>
  <nav aria-label="Canal de atención" class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
    <button type="button" aria-pressed={scope==='web'} onclick={()=>changeScope('web')} class="rounded-xl px-4 py-3 text-sm font-bold {scope==='web'?'bg-teal-700 text-white':'text-slate-700 hover:bg-slate-50'}">Clientes registrados · Web</button>
    <button type="button" aria-pressed={scope==='telegram-visitors'} onclick={()=>changeScope('telegram-visitors')} class="rounded-xl px-4 py-3 text-sm font-bold {scope==='telegram-visitors'?'bg-teal-700 text-white':'text-slate-700 hover:bg-slate-50'}">Chatbot Telegram · Sin cuenta vinculada</button>
  </nav>
  {#if scope==='telegram-visitors'}<p class="text-sm rounded-xl bg-slate-50 p-3 text-slate-600">Visitantes identificados por su ID de Telegram, aunque no tengan cuenta web vinculada. Se excluye el personal vinculado. El nombre y @usuario aparecen cuando Telegram los facilita; el teléfono no se obtiene automáticamente.</p>{/if}
  <form onsubmit={search} class="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-3">
    <label class="block flex-1 min-w-[180px] text-sm font-semibold text-slate-700">Buscar cliente
      <input bind:value={query} placeholder={scope==='web'?'Nombre, correo, teléfono o ID':'Nombre, @usuario o ID de Telegram'} maxlength="120" class="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2"/>
    </label>
    <label class="block text-sm font-semibold text-slate-700">Período
      <select value={period} onchange={setPeriod} class="mt-1 block rounded-xl border border-slate-200 px-3 py-2">
        {#each periods as p}<option value={p.id}>{p.label}</option>{/each}
      </select>
    </label>
    <button type="submit" disabled={loading} class="rounded-xl bg-teal-700 text-white px-4 py-2 font-semibold text-sm disabled:opacity-50">Buscar</button>
    {#if appliedQuery}<button type="button" onclick={()=>{query='';appliedQuery='';void load(1);}} class="rounded-xl border border-slate-200 px-4 py-2 text-sm">Limpiar</button>{/if}
  </form>
  {#if loading}<p role="status" class="text-sm text-slate-500">Consultando actividad…</p>{/if}
  {#if error}<p role="alert" class="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>{/if}
  {#if loaded}
    {#if appliedQuery}<p class="text-xs text-slate-500">Estadísticas filtradas por: {appliedQuery}</p>{/if}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {#each [{label:'Usuarios únicos',value:summary.users,detail:scope==='web'?'Una cuenta = un usuario':'Un ID de Telegram = un usuario'},{label:'Conversaciones',value:summary.conversations,detail:'Chats con mensajes reales'},{label:'Mensajes enviados',value:summary.messages,detail:'Solo mensajes del cliente'},{label:'Usuarios recurrentes',value:summary.returning_users,detail:'Dos o más chats distintos'}] as metric}
        <article class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold text-slate-600">{metric.label}</p><p class="text-3xl font-bold text-teal-800 mt-2">{fmt(metric.value)}</p><p class="text-xs text-slate-500 mt-1">{metric.detail}</p></article>
      {/each}
    </div>
    {#if scope==='web'}
    <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div class="p-4 border-b border-slate-100"><h3 class="font-bold text-slate-900">Usuarios del asistente web</h3><p class="text-xs text-slate-500 mt-1">Una fila por ID de cliente, ordenada por actividad más reciente. Fechas en hora de Cuba.</p></div>
      {#if users.length}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead class="bg-slate-50 text-xs font-semibold text-slate-600"><tr><th class="px-4 py-3">Cliente</th><th class="px-4 py-3">Conversaciones</th><th class="px-4 py-3">Mensajes</th><th class="px-4 py-3">Primera actividad</th><th class="px-4 py-3">Última actividad</th><th class="px-4 py-3">Acción</th></tr></thead>
            <tbody>
              {#each users as u (u.customer_id)}
                <tr class="border-t border-slate-100">
                  <td class="px-4 py-3"><p class="font-semibold">{u.name}</p><p class="text-xs text-slate-600">{u.phone||'Sin teléfono'} · {u.email||'Sin correo'}</p><p class="text-xs text-slate-500" title={u.customer_id}>{u.customer_id}</p>{#if !u.is_active}<p class="text-xs text-amber-700">Cuenta desactivada</p>{/if}</td>
                  <td class="px-4 py-3 font-bold tabular-nums">{fmt(u.conversations)}</td><td class="px-4 py-3 tabular-nums">{fmt(u.messages)}</td><td class="px-4 py-3">{date(u.first_activity)}</td><td class="px-4 py-3">{date(u.last_activity)}</td><td class="px-4 py-3"><button type="button" onclick={()=>onCustomer(u.customer_id)} class="font-semibold text-teal-800 underline text-xs">Ver expediente</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}<p class="p-4 text-sm text-slate-500">No se encontró actividad del asistente web para este filtro.</p>{/if}
    </div>
    {:else}
    <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div class="p-4 border-b border-slate-100"><h3 class="font-bold text-slate-900">Visitantes del chatbot Telegram</h3><p class="text-xs text-slate-500 mt-1">Una fila por ID de Telegram. Fechas en hora de Cuba.</p></div>
      {#if visitors.length}<div class="overflow-x-auto"><table class="w-full text-left text-sm whitespace-nowrap"><thead class="bg-slate-50 text-xs text-slate-600"><tr><th class="px-4 py-3">Visitante</th><th class="px-4 py-3">Conversaciones</th><th class="px-4 py-3">Interacciones</th><th class="px-4 py-3">Primera actividad</th><th class="px-4 py-3">Última actividad</th></tr></thead><tbody>
        {#each visitors as u (u.chat_id)}<tr class="border-t border-slate-100"><td class="px-4 py-3"><p class="font-semibold">{u.display_name||'Nombre no disponible'}</p><p class="text-xs text-slate-600">{u.username?'@'+u.username:'Sin usuario visible'}</p><p class="text-xs text-slate-500">ID: {u.chat_id}</p></td><td class="px-4 py-3 font-bold">{fmt(u.conversations)}</td><td class="px-4 py-3">{fmt(u.messages)}</td><td class="px-4 py-3">{date(u.first_activity)}</td><td class="px-4 py-3">{date(u.last_activity)}</td></tr>{/each}
      </tbody></table></div>{:else}<p class="p-4 text-sm text-slate-500">No hay actividad de visitantes para este filtro.</p>{/if}
    </div>
    {/if}
    <Pagination {page} total={summary.users} perPage={pageSize} onPage={load} disabled={loading} label="usuarios"/>
    <p class="text-xs text-slate-500">Cifras calculadas a partir de los mensajes conservados en la base de datos. {scope==='web'?'No cuentan chats vacíos, respuestas automáticas, Telegram ni conversaciones eliminadas.':'No cuentan respuestas automáticas, comandos sin historial, archivos ni conversaciones eliminadas. Si alguien vincula su cuenta deja de aparecer en visitantes. Los nombres antiguos pueden faltar hasta que vuelvan a escribir.'} Los períodos cuentan solo actividad dentro del intervalo elegido.</p>
  {/if}
</section>
