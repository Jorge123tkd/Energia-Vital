<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let requests: any[] = $state([]);
  let appointments: any[] = $state([]);
  let loading = $state(true);
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
      <article class="bg-white border rounded-xl p-4"><div class="flex justify-between gap-4"><strong>{item.title}</strong><span>{item.status}</span></div><p class="text-sm text-gray-600 mt-2">{item.description}</p><p class="text-xs text-gray-500 mt-2">{new Date(item.created_at).toLocaleDateString('es-CU')}</p></article>
    {/each}
  </div>
  <h2 class="text-xl font-semibold mb-3">Citas</h2>
  {#if !loading && appointments.length === 0}<p class="text-gray-500">Todavía no tienes citas.</p>{/if}
  <div class="space-y-3">
    {#each appointments as item (item.id)}
      <article class="bg-white border rounded-xl p-4"><div class="flex justify-between gap-4"><strong>{item.title}</strong><span>{item.status}</span></div><p class="text-sm text-gray-600 mt-2">{new Date(item.starts_at).toLocaleString('es-CU')}</p></article>
    {/each}
  </div>
</div>
