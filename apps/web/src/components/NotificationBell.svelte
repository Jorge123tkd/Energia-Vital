<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let { staff = false, token = '', onAll }: {
    staff?: boolean; token?: string; onAll?: () => void;
  } = $props();
  let open = $state(false);
  let loading = $state(false);
  let items: any[] = $state([]);
  let error = $state('');
  let busyId = $state('');
  let unread = $derived(items.filter(n => !n.is_read).length);
  async function refresh() {
    if (loading) return;
    loading = true; error = '';
    try {
      const data = staff ? await api.getStaffInbox(token) : await api.getNotifications();
      items = data.notifications || [];
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudieron cargar los avisos'; }
    finally { loading = false; }
  }
  onMount(() => { void refresh(); });
  async function read(n: any) {
    if (n.is_read || busyId) return;
    busyId = n.id;
    try {
      if (staff) await api.markStaffNotificationRead(token, n.id);
      else await api.markNotificationRead(n.id);
      items = items.map(x => x.id === n.id ? { ...x, is_read: 1 } : x);
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo marcar como leído'; }
    finally { busyId = ''; }
  }
</script>

<div class="relative">
  <button type="button" onclick={() => { open = !open; if (open) void refresh(); }}
    class="relative rounded-xl border border-slate-200 p-2.5 bg-white hover:bg-slate-50"
    aria-label={'Notificaciones' + (unread ? ', ' + unread + ' sin leer' : '')} aria-expanded={open}>
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
      <path d="M10 21h4"/>
    </svg>
    {#if unread}
      <span class="absolute -top-1.5 -right-1.5 text-[10px] leading-5 min-w-5 px-1 rounded-full bg-red-600 text-white font-bold text-center">{unread > 99 ? '99+' : unread}</span>
    {/if}
  </button>
  {#if open}
    <div class="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] max-h-[70vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
      <div class="flex justify-between gap-2 items-center px-4 py-3 bg-slate-50 border-b">
        <h3 class="font-bold text-slate-900">Notificaciones {unread ? '(' + unread + ')' : ''}</h3>
        <button class="text-xs text-teal-800 font-semibold" onclick={() => refresh()} disabled={loading}>{loading ? 'Cargando…' : 'Actualizar'}</button>
        <button aria-label="Cerrar avisos" class="text-slate-600" onclick={() => open = false}>✕</button>
      </div>
      {#if error}<p class="text-red-700 text-sm px-4 py-3" role="alert">{error}</p>{/if}
      <div class="overflow-y-auto divide-y divide-slate-100">
        {#each items.slice(0, 12) as n (n.id)}
          <div class="p-3.5 space-y-1 {n.is_read ? 'bg-white' : 'bg-teal-50/70'}">
            <div class="flex justify-between items-start gap-2">
              <strong class="text-sm text-slate-900">{n.title}</strong>
              {#if !n.is_read}<button disabled={busyId === n.id} onclick={() => read(n)} class="text-[11px] font-bold text-teal-800 shrink-0">Marcar leída</button>{/if}
            </div>
            <p class="text-xs text-slate-600 whitespace-pre-wrap break-words">{n.message}</p>
            <p class="text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString('es-CU')}</p>
          </div>
        {/each}
        {#if items.length === 0 && !loading}<p class="p-6 text-sm text-slate-500 text-center">Todavía no tienes notificaciones.</p>{/if}
      </div>
      {#if onAll}
        <button class="p-3 border-t text-sm font-bold text-teal-800 bg-white hover:bg-teal-50"
          onclick={() => { open = false; onAll(); }}>Ver todas las notificaciones</button>
      {/if}
    </div>
  {/if}
</div>
