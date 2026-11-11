<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import RequestPhotoGallery from './RequestPhotoGallery.svelte';
  let requests: any[] = $state([]);
  let appointments: any[] = $state([]);
  let loading = $state(true);
  let expanded = $state('');
  let copiedId=$state('');
  async function copyReference(id:string){
    try{await navigator.clipboard.writeText(id);copiedId=id;}
    catch{error='No se pudo copiar. Selecciona el ID completo.';}
  }
  let error = $state('');
  onMount(async () => {
    try {
      const [a, b] = await Promise.all([api.getMyRequests(), api.getMyAppointments()]);
      requests = a.requests ?? []; appointments = b.appointments ?? [];
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar el historial'; }
    finally { loading = false; }
  });
</script>
<div class="max-w-4xl mx-auto py-8">
  <h1 class="text-3xl font-bold mb-3">Mis solicitudes y citas</h1>
  <p class="text-gray-600 mb-8">Solo puedes consultar los registros vinculados a tu cuenta.</p>
  {#if loading}<p>Cargando…</p>{/if}
  {#if error}<p role="alert" class="text-red-700">{error}</p>{/if}
  <h2 class="text-xl font-semibold mb-3">Solicitudes</h2>
  {#if !loading && requests.length === 0}<p class="text-gray-500 mb-8">Todavía no tienes solicitudes.</p>{/if}
  <div class="space-y-3 mb-10">
    {#each requests as item (item.id)}
      <article class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div class="flex flex-wrap justify-between gap-3 items-start"><strong class="text-slate-900">{item.title}</strong><span class="text-xs font-bold rounded-full px-2 py-1 bg-teal-50 text-teal-800">{item.status}</span></div>
          <p class="text-sm text-slate-600 whitespace-pre-line">{item.description}</p>
          <div class="flex flex-wrap justify-between gap-2 items-center">
            <div class="min-w-0">
              <p class="text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString('es-CU')} · Ref. {item.id.slice(0,8).toUpperCase()}</p>
              <p class="mt-1 text-[11px] text-slate-500 break-all" title={item.id}>ID completo: {item.id}</p>
              <button type="button" onclick={() => copyReference(item.id)} class="text-xs font-bold text-teal-800 underline mt-1">{copiedId===item.id?'Copiado ✓':'Copiar ID para seguimiento'}</button>
            </div>
            <button type="button" class="rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50"
              onclick={() => expanded = expanded === item.id ? '' : item.id}>
              {expanded===item.id?'Ocultar fotos':'Fotos ('+(item.image_count||0)+') · Ver o añadir'}
            </button>
          </div>
          {#if expanded===item.id}<RequestPhotoGallery requestId={item.id} canUpload />{/if}
        </article>
    {/each}
  </div>
  <h2 class="text-xl font-semibold mb-3">Citas</h2>
  {#if !loading && appointments.length === 0}<p class="text-gray-500">Todavía no tienes citas.</p>{/if}
  <div class="space-y-3">
    {#each appointments as item (item.id)}
      <article class="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <div class="flex flex-wrap justify-between gap-3"><strong class="text-slate-900">{item.title}</strong><span class="rounded-full bg-teal-50 text-teal-800 px-2 py-1 text-xs font-bold">{item.status}</span></div>
          <p class="text-sm text-slate-600">{new Date(item.starts_at).toLocaleString('es-CU')}</p>
          <p class="text-[11px] text-slate-500 break-all">ID completo: {item.id}</p>
          <button type="button" onclick={() => copyReference(item.id)} class="text-xs text-teal-800 underline font-bold text-left">{copiedId===item.id?'Copiado ✓':'Copiar ID de cita'}</button>
        </article>
    {/each}
  </div>
</div>
