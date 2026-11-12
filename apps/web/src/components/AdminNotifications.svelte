<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import Pagination from './Pagination.svelte';
  import NotificationsPage from './NotificationsPage.svelte';

  let { token, canSend }: { token: string; canSend: boolean } = $props();
  type Recipient = {id:string;name:string;email:string};
  let modal: 'welcome' | 'send' | null = $state(null);

  let welcomeEnabled=$state(true);
  let welcomeTitle=$state('¡Bienvenido a Bonaire!');
  let welcomeMessage=$state('Gracias por registrarte. Desde tu cuenta puedes solicitar servicios, consultar tus citas y recibir notificaciones.');
  let welcomeBusy=$state(false),welcomeStatus=$state(''),welcomeError=$state('');

  let campaigns:any[]=$state([]);
  let historyPage=$state(1),historyTotal=$state(0),historyLoading=$state(false),historyError=$state('');
  const historySize=10;
  async function loadCampaigns(nextPage=historyPage){
    if(!canSend)return;
    historyLoading=true;historyError='';
    try{
      const r=await api.listSentNotifications(token,nextPage,historySize);
      campaigns=r.campaigns||[];historyTotal=r.total||0;historyPage=nextPage;
    }catch(e){historyError=e instanceof Error?e.message:'No se pudo cargar el historial de envíos.';}
    finally{historyLoading=false;}
  }
  function audience(row:any){
    try{
      const data=JSON.parse(row.campaign_data||'{}');
      if(data.audience==='all')return 'Todos los clientes activos';
      if(data.audience==='selected')return 'Clientes seleccionados';
    }catch{ /* envíos anteriores al registro de campañas */ }
    return 'Destinatarios del envío';
  }
  onMount(()=>{
    if(!canSend)return;
    void loadCampaigns(1);
    void api.getWelcomeAutomation(token).then((data:any)=>{
      welcomeEnabled=Boolean(data.enabled);
      welcomeTitle=data.title;
      welcomeMessage=data.message;
    }).catch((e:Error)=>{welcomeError=e.message;});
  });
  async function saveWelcome(e:SubmitEvent){
    e.preventDefault();welcomeBusy=true;welcomeStatus='';welcomeError='';
    try{
      await api.saveWelcomeAutomation(token,welcomeEnabled,welcomeTitle,welcomeMessage);
      welcomeStatus='Bienvenida guardada. Se aplicará a futuros registros.';
      modal=null;
    }catch(e){welcomeError=e instanceof Error?e.message:'No se pudo guardar.';}
    finally{welcomeBusy=false;}
  }

  let title=$state(''),message=$state('');
  let target:'all'|'specific'=$state('all');
  let selectedCustomers:Recipient[]=$state([]);
  let searchTerm=$state(''),searchResults:Recipient[]=$state([]);
  let searchBusy=$state(false),searchError=$state('');
  let searchSeq=0;
  let searchTimer:ReturnType<typeof setTimeout>|undefined;
  let busy=$state(false),error=$state(''),success=$state('');

  async function searchRecipients(term:string){
    const seq=++searchSeq;
    searchError='';
    if(term.trim().length<2){searchResults=[];searchBusy=false;return;}
    searchBusy=true;
    try{
      // Búsqueda paginada por ID, nombre completo o correo; no descargar el listado entero.
      const data=await api.adminCustomers(token,term.trim(),1,12);
      if(seq!==searchSeq)return;
      searchResults=(data.customers||[]).filter((c:any)=>Boolean(c.is_active))
        .map((c:any)=>({id:String(c.id),name:String(c.name||'Cliente'),email:String(c.email||'')}));
    }catch(e){
      if(seq===searchSeq)searchError=e instanceof Error?e.message:'No se pudieron buscar clientes.';
    }finally{if(seq===searchSeq)searchBusy=false;}
  }
  function queueSearch(){
    if(searchTimer)clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{void searchRecipients(searchTerm);},280);
  }
  function selectRecipient(customer:Recipient){
    if(selectedCustomers.some(c=>c.id===customer.id)||selectedCustomers.length>=100)return;
    selectedCustomers=[...selectedCustomers,customer];
    searchTerm='';searchResults=[];searchError='';
    if(searchTimer)clearTimeout(searchTimer);
    searchSeq++;
  }
  function deselectRecipient(id:string){selectedCustomers=selectedCustomers.filter(c=>c.id!==id);}
  async function send(e:SubmitEvent){
    e.preventDefault();
    if(!canSend||busy)return;
    if(target==='specific'&&!selectedCustomers.length){error='Busca y selecciona al menos un cliente.';return;}
    const count=selectedCustomers.length;
    const confirmed=window.confirm(target==='all'
      ? '¿Enviar esta notificación a todos los clientes activos?'
      : '¿Enviar esta notificación a los '+count+' clientes seleccionados?');
    if(!confirmed)return;
    error='';success='';busy=true;
    try{
      const response=target==='all'
        ? await api.sendAllCustomerNotifications(token,title.trim(),message.trim())
        : await api.sendCustomerNotification(token,selectedCustomers.map(c=>c.id),title.trim(),message.trim());
      success='Notificación enviada a '+Number(response.sent||0)+' clientes.';
      title='';message='';selectedCustomers=[];searchTerm='';searchResults=[];
      modal=null;
      await loadCampaigns(1);
    }catch(e){error=e instanceof Error?e.message:'No se pudo enviar.';}
    finally{busy=false;}
  }
</script>

<div class="space-y-5">
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h2 class="text-xl font-extrabold text-slate-900">Centro de notificaciones</h2>
      <p class="text-sm text-slate-500 mt-1">Solo comunicaciones de Bonaire a los clientes. Los avisos internos de solicitudes y citas permanecen en la campanita del personal.</p>
    </div>
    {#if canSend}
      <div class="flex flex-wrap gap-2">
        <button type="button" onclick={()=>{welcomeError='';modal='welcome';}}
          class="rounded-xl border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 px-4 py-3 text-sm font-bold">⚙ Editar bienvenida</button>
        <button type="button" onclick={()=>{error='';modal='send';}}
          class="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-white text-sm font-bold">＋ Crear notificación</button>
      </div>
    {/if}
  </header>
  {#if success}<p role="status" class="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">{success}</p>{/if}
  {#if welcomeStatus}<p role="status" class="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">{welcomeStatus}</p>{/if}
  {#if canSend}
    <article class="rounded-2xl border border-teal-200 bg-white p-4 sm:p-5 space-y-2">
      <div class="flex flex-wrap justify-between gap-2">
        <h3 class="font-extrabold text-slate-900">Bienvenida automática</h3>
        <span class="text-xs font-bold {welcomeEnabled?'text-teal-700':'text-slate-500'}">
          {welcomeEnabled?'Activada':'Desactivada'}
        </span>
      </div>
      {#if welcomeError}<p role="alert" class="text-sm text-red-700">{welcomeError}</p>{/if}
      <p class="font-semibold text-sm text-slate-900">{welcomeTitle}</p>
      <p class="whitespace-pre-wrap text-sm text-slate-700 break-words">{welcomeMessage}</p>
      <p class="text-xs text-slate-500">Se envía al registrarse. No se mezcla con las notificaciones operativas de solicitudes.</p>
    </article>
    <section class="space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h3 class="text-lg font-extrabold text-slate-900">Historial de notificaciones enviadas ({historyTotal})</h3>
        <button type="button" disabled={historyLoading} onclick={()=>void loadCampaigns()}
          class="rounded-xl border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-800">Actualizar</button>
      </div>
      {#if historyError}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{historyError}</p>{/if}
      {#if historyLoading}<p class="text-sm text-slate-500">Cargando campañas…</p>{/if}
      {#each campaigns as campaign (campaign.id)}
        <article class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-2">
          <div class="flex flex-wrap justify-between gap-2">
            <h4 class="font-bold text-slate-900">{campaign.title}</h4>
            <span class="text-xs text-slate-500">{new Date(campaign.created_at).toLocaleString('es-CU')}</span>
          </div>
          <p class="whitespace-pre-wrap text-sm text-slate-700 break-words">{campaign.message}</p>
          <p class="text-xs font-semibold text-teal-800">{audience(campaign)} · {campaign.recipient_count} destinatario(s)</p>
        </article>
      {/each}
      {#if !historyLoading&&!campaigns.length}
        <p class="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-600">Todavía no hay notificaciones manuales enviadas a clientes. Los avisos de solicitudes no aparecen aquí.</p>
      {/if}
      <Pagination page={historyPage} total={historyTotal} perPage={historySize}
        disabled={historyLoading} label="envíos" onPage={loadCampaigns}/>
    </section>
  {:else}
    <p class="text-sm text-slate-600">Las campañas para clientes se gestionan desde una cuenta administradora. Tus avisos internos están aquí:</p>
    <NotificationsPage staff {token}/>
  {/if}
</div>

{#if modal}
  <div class="fixed inset-0 z-[210] bg-slate-950/70 flex items-center justify-center p-3 sm:p-6">
    <button type="button" class="absolute inset-0" aria-label="Cerrar ventana"
      onclick={()=>{if(!busy&&!welcomeBusy)modal=null;}}></button>
    <dialog open aria-label={modal==='welcome'?'Automatizaciones de clientes':'Enviar notificación'}
      class="relative m-0 bg-white w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl shadow-2xl">
      <header class="sticky top-0 z-10 flex justify-between items-center gap-3 bg-white border-b border-slate-200 p-4 sm:p-6">
        <div>
          <p class="text-xs font-extrabold text-teal-700 uppercase tracking-widest">Bonaire</p>
          <h2 class="font-extrabold text-xl text-slate-900 mt-1">{modal==='welcome'?'Automatizaciones':'Crear notificación'}</h2>
        </div>
        <button type="button" aria-label="Cerrar" disabled={busy||welcomeBusy} onclick={()=>modal=null}
          class="shrink-0 rounded-xl bg-slate-100 text-slate-700 w-10 h-10 font-bold">✕</button>
      </header>
      {#if modal==='welcome'}
        <form onsubmit={saveWelcome} class="p-4 sm:p-6 space-y-4">
          <div class="rounded-xl border border-teal-100 bg-teal-50 p-4">
            <h3 class="text-base font-extrabold text-slate-900">Bienvenida para clientes nuevos</h3>
            <p class="text-sm text-slate-600 mt-2">Aparece en la campanita cuando alguien se registra. No envía WhatsApp, SMS ni correo.</p>
          </div>
          {#if welcomeError}<p role="alert" class="text-sm text-red-700">{welcomeError}</p>{/if}
          <label class="flex gap-3 items-center text-sm font-bold text-slate-800">
            <input type="checkbox" bind:checked={welcomeEnabled}/> Activar bienvenida automática
          </label>
          <label class="block text-sm font-semibold text-slate-700">Título
            <input required minlength="3" maxlength="120" class="form-input" bind:value={welcomeTitle}/>
          </label>
          <label class="block text-sm font-semibold text-slate-700">Mensaje
            <textarea required minlength="10" maxlength="800" rows="4" class="form-input" bind:value={welcomeMessage}></textarea>
          </label>
          <p class="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            Los avisos de recepción de solicitudes y los cambios de estado son operativos y se mantienen separados de los mensajes creados aquí.
          </p>
          <button disabled={welcomeBusy} class="rounded-xl bg-teal-700 text-white font-bold w-full py-3">
            {welcomeBusy?'Guardando…':'Guardar bienvenida'}
          </button>
        </form>
      {:else}
        <form onsubmit={send} class="p-4 sm:p-6 space-y-4">
          <p class="text-sm text-slate-600">El aviso aparecerá en la campanita de los clientes seleccionados.</p>
          {#if error}<p role="alert" class="text-red-700 rounded-xl bg-red-50 p-3 text-sm">{error}</p>{/if}
          <label class="block text-sm font-semibold text-slate-700">Destinatarios
            <select class="form-input" bind:value={target}>
              <option value="all">Todos los clientes activos</option>
              <option value="specific">Clientes específicos (puedes elegir varios)</option>
            </select>
          </label>
          {#if target==='specific'}
            <div class="space-y-3 rounded-2xl bg-slate-50 border border-slate-200 p-3 sm:p-4">
              <label class="block text-sm font-semibold text-slate-700">Buscar por ID, nombre, apellidos o correo
                <input type="search" class="form-input" maxlength="120" bind:value={searchTerm}
                  oninput={queueSearch} placeholder="Escribe el nombre completo o pega un ID…"
                  aria-label="Buscar clientes destinatarios"/>
              </label>
              {#if searchBusy}<p role="status" class="text-xs text-slate-500">Buscando clientes…</p>{/if}
              {#if searchError}<p role="alert" class="text-xs text-red-700">{searchError}</p>{/if}
              {#if searchTerm.trim().length>=2}
                <div class="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {#each searchResults as customer (customer.id)}
                    <button type="button" onclick={()=>selectRecipient(customer)}
                      disabled={selectedCustomers.some(c=>c.id===customer.id)||selectedCustomers.length>=100}
                      class="w-full text-left p-3 hover:bg-teal-50 disabled:opacity-50">
                      <span class="block text-sm font-bold text-slate-900">{customer.name}</span>
                      <span class="block text-xs text-slate-500 break-all">{customer.email} · ID: {customer.id}</span>
                      {#if selectedCustomers.some(c=>c.id===customer.id)}<span class="text-xs text-teal-700 font-bold">Ya seleccionado</span>{/if}
                    </button>
                  {/each}
                  {#if !searchBusy&&!searchResults.length}<p class="p-3 text-xs text-slate-500">No hay clientes activos que coincidan con esta búsqueda.</p>{/if}
                </div>
              {/if}
              <p class="text-xs font-bold text-slate-700">Seleccionados: {selectedCustomers.length} de 100 como máximo</p>
              <div class="flex flex-wrap gap-2">
                {#each selectedCustomers as customer (customer.id)}
                  <span class="inline-flex items-center gap-1.5 max-w-full rounded-full bg-teal-100 border border-teal-200 text-teal-950 px-3 py-1.5 text-xs font-semibold">
                    <span class="truncate max-w-40">{customer.name}</span>
                    <button type="button" onclick={()=>deselectRecipient(customer.id)}
                      aria-label={'Quitar a '+customer.name} class="text-teal-800 font-black hover:text-red-700">✕</button>
                  </span>
                {/each}
              </div>
              <p class="text-xs text-slate-500">Añade los clientes uno por uno a la selección y luego envía el mismo mensaje a todos los elegidos.</p>
            </div>
          {/if}
          <label class="block text-sm font-semibold text-slate-700">Título
            <input required minlength="1" maxlength="200" class="form-input" bind:value={title} placeholder="Novedades de Bonaire"/>
          </label>
          <label class="block text-sm font-semibold text-slate-700">Mensaje
            <textarea required minlength="1" maxlength="2000" rows="5" class="form-input" bind:value={message} placeholder="Escribe el aviso…"></textarea>
          </label>
          <button disabled={busy||(target==='specific'&&!selectedCustomers.length)}
            class="rounded-xl px-5 py-3 bg-teal-700 text-white font-bold w-full disabled:opacity-50">
            {busy?'Enviando…':target==='all'?'Enviar a todos los clientes':'Enviar a '+selectedCustomers.length+' seleccionado(s)'}
          </button>
        </form>
      {/if}
    </dialog>
  </div>
{/if}
<style>.form-input{display:block;width:100%;margin-top:.45rem;padding:.75rem;border:1px solid #cbd5e1;border-radius:.75rem;background:white;color:#0f172a}</style>
