<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import NotificationsPage from './NotificationsPage.svelte';
  let { token, customers, canSend }: { token: string; customers: any[]; canSend: boolean } = $props();
  let modal: 'welcome' | 'send' | null = $state(null);
  let welcomeEnabled = $state(true);
  let welcomeTitle = $state('¡Bienvenido a Bonaire!');
  let welcomeMessage = $state('Gracias por registrarte. Desde tu cuenta puedes solicitar servicios, consultar tus citas y recibir notificaciones.');
  let welcomeBusy = $state(false);
  let welcomeStatus = $state('');
  let welcomeError = $state('');
  onMount(() => {
    if (!canSend) return;
    void api.getWelcomeAutomation(token).then((data:any) => {
      welcomeEnabled = Boolean(data.enabled);
      welcomeTitle = data.title;
      welcomeMessage = data.message;
    }).catch((e:Error) => { welcomeError = e.message; });
  });
  async function saveWelcome(e: SubmitEvent) {
    e.preventDefault();
    welcomeBusy = true; welcomeStatus = ''; welcomeError = '';
    try {
      await api.saveWelcomeAutomation(token,welcomeEnabled,welcomeTitle,welcomeMessage);
      welcomeStatus = 'Configuración guardada. Se aplicará a los próximos registros.';
      modal = null;
    }catch(e){welcomeError=e instanceof Error?e.message:'No se pudo guardar';}
    finally{welcomeBusy=false;}
  }
  let title = $state('');
  let message = $state('');
  let target = $state('all');
  let customerId = $state('');
  let busy = $state(false);
  let error = $state('');
  let success = $state('');
  async function send(e: SubmitEvent) {
    e.preventDefault(); if (!canSend || busy) return;
    if (!window.confirm(target === 'all' ? '¿Enviar este aviso a todos los clientes registrados?' : '¿Enviar este aviso a este cliente?')) return;
    error = ''; success = ''; busy = true;
    try {
      if (target === 'all') {
        const r = await api.sendAllCustomerNotifications(token, title.trim(), message.trim());
        success = 'Notificación enviada a ' + r.sent + ' clientes.';
      } else {
        if (!customerId) throw new Error('Selecciona un cliente.');
        await api.sendCustomerNotification(token, [customerId], title.trim(), message.trim());
        success = 'Aviso enviado al cliente seleccionado.';
      }
      title = ''; message = '';
      modal = null;
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo enviar'; }
    finally { busy = false; }
  }
</script>

<div class="space-y-5">
  <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h2 class="text-xl font-extrabold text-slate-900">Centro de notificaciones</h2>
      <p class="text-sm text-slate-500 mt-1">Consulta los avisos y organiza tus comunicaciones.</p>
    </div>
    {#if canSend}
      <div class="flex flex-wrap gap-2">
        <button type="button" onclick={() => {welcomeError='';modal='welcome';}}
          class="rounded-xl border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 px-4 py-3 text-sm font-bold">⚙ Automatizaciones</button>
        <button type="button" onclick={() => {error='';modal='send';}}
          class="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-3 text-white text-sm font-bold">＋ Crear notificación</button>
      </div>
    {/if}
  </header>
  {#if success}<p role="status" class="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">{success}</p>{/if}
  {#if welcomeStatus}<p role="status" class="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">{welcomeStatus}</p>{/if}
  <NotificationsPage staff {token}/>
</div>
{#if modal}
  <div class="fixed inset-0 z-[210] bg-slate-950/70 flex items-center justify-center p-3 sm:p-6">
    <button type="button" class="absolute inset-0" aria-label="Cerrar ventana"
      onclick={() => {if(!busy&&!welcomeBusy)modal=null;}}></button>
    <dialog open aria-label={modal==='welcome'?'Automatizaciones de clientes':'Enviar notificación'}
      class="relative m-0 bg-white w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl shadow-2xl">
      <header class="sticky top-0 z-10 flex justify-between items-center gap-3 bg-white border-b border-slate-200 p-4 sm:p-6">
        <div>
          <p class="text-xs font-extrabold text-teal-700 uppercase tracking-widest">Bonaire</p>
          <h2 class="font-extrabold text-xl text-slate-900 mt-1">{modal==='welcome'?'Automatizaciones':'Crear notificación'}</h2>
        </div>
        <button type="button" aria-label="Cerrar" disabled={busy||welcomeBusy} onclick={() => modal=null}
          class="shrink-0 rounded-xl bg-slate-100 text-slate-700 w-10 h-10 font-bold">✕</button>
      </header>
      {#if modal==='welcome'}
        <form onsubmit={saveWelcome} class="p-4 sm:p-6 space-y-4">
          <div class="rounded-xl border border-teal-100 bg-teal-50 p-4">
            <h3 class="text-base font-extrabold text-slate-900">Bienvenida para clientes nuevos</h3>
            <p class="text-sm text-slate-600 mt-2">Aparece en la campanita cuando alguien se registra. No envía WhatsApp, SMS ni correo electrónico.</p>
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
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p class="text-sm font-bold text-slate-900">Otros avisos automáticos activos</p>
            <p class="mt-1 text-xs text-slate-600">Confirmación de recepción de solicitudes y cambios de estado de citas y solicitudes. Los envíos programados por fecha serán una función posterior.</p>
          </div>
          <button disabled={welcomeBusy} class="rounded-xl bg-teal-700 text-white font-bold w-full py-3">
            {welcomeBusy?'Guardando…':'Guardar automatización'}
          </button>
        </form>
      {:else}
        <form onsubmit={send} class="p-4 sm:p-6 space-y-4">
          <p class="text-sm text-slate-600">El aviso aparecerá en la campanita de los clientes seleccionados.</p>
          {#if error}<p role="alert" class="text-red-700 rounded-xl bg-red-50 p-3 text-sm">{error}</p>{/if}
          <label class="block text-sm font-semibold text-slate-700">Destinatarios
            <select class="form-input" bind:value={target}>
              <option value="all">Todos los clientes</option>
              <option value="one">Un cliente específico</option>
            </select>
          </label>
          {#if target==='one'}
            <label class="block text-sm font-semibold text-slate-700">Cliente
              <select required class="form-input" bind:value={customerId}>
                <option value="">Seleccionar…</option>
                {#each customers as c (c.id)}<option value={c.id}>{c.name} ({c.email})</option>{/each}
              </select>
            </label>
          {/if}
          <label class="block text-sm font-semibold text-slate-700">Título
            <input required maxlength="200" class="form-input" bind:value={title} placeholder="Novedades de Bonaire"/>
          </label>
          <label class="block text-sm font-semibold text-slate-700">Mensaje
            <textarea required maxlength="2000" rows="5" class="form-input" bind:value={message} placeholder="Escribe el aviso…"></textarea>
          </label>
          <button disabled={busy} class="rounded-xl px-5 py-3 bg-teal-700 text-white font-bold w-full">
            {busy?'Enviando…':target==='all'?'Enviar a todos los clientes':'Enviar notificación'}
          </button>
        </form>
      {/if}
    </dialog>
  </div>
{/if}
<style>.form-input{display:block;width:100%;margin-top:.45rem;padding:.75rem;border:1px solid #cbd5e1;border-radius:.75rem;background:white;color:#0f172a}</style>
