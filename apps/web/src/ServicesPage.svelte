<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let services: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  onMount(async () => {
    try { services = (await api.getServices()).services ?? []; }
    catch (e) { error = e instanceof Error ? e.message : 'Error al cargar servicios'; }
    finally { loading = false; }
  });
  function request(service: any) { window.location.href = `/contacto?service=${encodeURIComponent(service.name)}`; }
</script>
<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Nuestros servicios</h1>
  {#if loading}<p>Cargando…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if services.length === 0}<p>Todavía no se han publicado servicios.</p>
  {:else}<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each services as s (s.id)}
      <article class="bg-white border rounded-xl p-6 space-y-3">
        <h2 class="text-xl font-semibold">{s.name}</h2>
        <p class="text-gray-600">{s.description || 'Consulta detalles del servicio.'}</p>
        {#if s.scope}<p class="text-sm text-gray-500">{s.scope}</p>{/if}
        <p class="font-medium">{s.price_type === 'fixed' && s.price != null ? `${Number(s.price).toLocaleString('es-CU')} ${s.currency || 'USD'}` : 'Precio a consultar'}</p>
        <button class="bg-energia-600 text-white rounded-lg px-5 py-3 w-full" onclick={() => request(s)}>Solicitar servicio</button>
      </article>
    {/each}</div>
  {/if}
</div>
