<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import Pagination from './Pagination.svelte';
  let { staff = false, token = '' }: { staff?: boolean; token?: string } = $props();
  let items: any[] = $state([]);
  let page = $state(1);
  const perPage = 10;
  let pageCount = $derived(Math.max(1, Math.ceil(items.length / perPage)));
  let pageRows = $derived(items.slice((Math.min(page,pageCount)-1)*perPage, Math.min(page,pageCount)*perPage));
  let error = $state('');
  let busy = $state(false);
  async function load() {
    busy = true; error = '';
    try { const data = staff ? await api.getStaffInbox(token) : await api.getNotifications(); items = data.notifications || []; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudieron obtener los avisos.'; }
    finally { busy = false; }
  }
  async function read(n: any) {
    try {
      if (staff) await api.markStaffNotificationRead(token, n.id);
      else await api.markNotificationRead(n.id);
      items = items.map(x => x.id === n.id ? { ...x, is_read: 1 } : x);
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo cambiar el estado'; }
  }
  onMount(() => { void load(); });
</script>

<section class="w-full max-w-5xl mx-auto px-2 sm:px-4 py-6 sm:py-10">
  <header class="flex justify-between items-center gap-4 mb-6">
    <div><span class="uppercase tracking-wider text-xs font-bold text-teal-700">Bonaire · Tu cuenta</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">Notificaciones</h1>
      <p class="text-slate-600 mt-2">Avisos relacionados con tus solicitudes, citas y mensajes.</p>
    </div>
    <button type="button" onclick={() => load()} class="px-4 py-2.5 rounded-xl border border-teal-200 text-teal-800 font-bold bg-white">Actualizar</button>
  </header>
  {#if error}<p class="bg-red-50 text-red-700 rounded-xl p-4 mb-4" role="alert">{error}</p>{/if}
  {#if busy}<p class="text-sm text-slate-500">Cargando avisos…</p>{/if}
  <div class="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
    {#each pageRows as n (n.id)}
      <article class="p-4 sm:p-5 flex flex-wrap justify-between items-start gap-3 {n.is_read ? '' : 'bg-teal-50'}">
        <div class="flex-1 min-w-0 space-y-2">
          <div class="flex flex-wrap gap-2 items-center">
            <h2 class="font-bold text-slate-900">{n.title}</h2>
            {#if !n.is_read}<span class="px-2 py-0.5 text-[11px] font-bold bg-teal-700 text-white rounded-full">Nueva</span>{/if}
          </div>
          <p class="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.message}</p>
          <p class="text-xs text-slate-400">{new Date(n.created_at).toLocaleString('es-CU')}</p>
        </div>
        {#if !n.is_read}<button class="text-teal-800 font-semibold text-sm px-3 py-2 rounded-xl border" onclick={() => read(n)}>Marcar como leída</button>{/if}
      </article>
    {/each}
    {#if !items.length && !busy}<p class="p-8 text-center text-slate-500">No hay notificaciones todavía.</p>{/if}
  </div>
  <Pagination page={Math.min(page,pageCount)} total={items.length} perPage={perPage}
    label="notificaciones" onPage={n => page = n} />
</section>
