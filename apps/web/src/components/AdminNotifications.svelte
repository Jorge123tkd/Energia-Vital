<script lang="ts">
  import { api } from '../lib/api';
  import NotificationsPage from './NotificationsPage.svelte';
  let { token, customers, canSend }: { token: string; customers: any[]; canSend: boolean } = $props();
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
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo enviar'; }
    finally { busy = false; }
  }
</script>
<div class="grid xl:grid-cols-2 gap-6 items-start">
  <div class="min-w-0">
    <NotificationsPage staff {token} />
  </div>
  {#if canSend}
    <section class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
      <h2 class="text-xl font-bold text-slate-900">Enviar aviso a clientes</h2>
      <p class="text-sm text-slate-500">El aviso aparecerá en su campanita de notificaciones cuando entren en Bonaire.</p>
      {#if error}<p role="alert" class="text-red-700 rounded-xl bg-red-50 p-3">{error}</p>{/if}
      {#if success}<p role="status" class="text-emerald-800 rounded-xl bg-emerald-50 p-3">{success}</p>{/if}
      <form class="space-y-4" onsubmit={send}>
        <label class="block text-sm font-semibold">Destinatarios
          <select class="form-input" bind:value={target}>
            <option value="all">Todos los clientes</option>
            <option value="one">Un cliente específico</option>
          </select>
        </label>
        {#if target === 'one'}
          <label class="block text-sm font-semibold">Selecciona el cliente
            <select required class="form-input" bind:value={customerId}>
              <option value="">Seleccionar…</option>
              {#each customers as c (c.id)}<option value={c.id}>{c.name} ({c.email})</option>{/each}
            </select>
          </label>
        {/if}
        <label class="block text-sm font-semibold">Título<input required maxlength="200" class="form-input" bind:value={title} placeholder="Novedades de Bonaire"/></label>
        <label class="block text-sm font-semibold">Mensaje<textarea required maxlength="2000" rows="5" class="form-input" bind:value={message} placeholder="Escribe el aviso…"></textarea></label>
        <button disabled={busy} class="rounded-xl px-5 py-3 bg-teal-700 text-white font-semibold w-full">{busy ? 'Enviando…' : 'Enviar notificación'}</button>
      </form>
    </section>
  {/if}
</div>
<style>.form-input { display:block; width:100%; margin-top:.45rem; padding:.75rem; border:1px solid #cbd5e1; border-radius:.75rem; background:white; }</style>
