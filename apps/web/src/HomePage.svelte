<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let { onAssistant }: { onAssistant: () => void } = $props();
  let products: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  onMount(async () => {
    try { products = (await api.getProducts({ featured: 'true' })).products ?? []; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar el catálogo'; }
    finally { loading = false; }
  });
  function consult(p: any) { window.location.href = `/contacto?product=${encodeURIComponent(p.name)}`; }
</script>
<header class="bg-energia-900 text-white rounded-xl py-16 px-6 text-center">
  <h1 class="text-4xl sm:text-5xl font-bold mb-5">Energía Vital</h1>
  <p class="text-xl mb-8 max-w-2xl mx-auto">Paneles solares, inversores, baterías y servicios de instalación y mantenimiento. Explora libremente nuestro catálogo y servicios. Crea una cuenta cuando quieras solicitar asesoría o hacer un pedido.</p>
  <div class="flex flex-wrap justify-center gap-3">
    <button onclick={onAssistant} class="bg-energia-600 text-white font-semibold px-6 py-3 rounded-lg">Hablar con el asistente</button>
    <a href="/catalogo" class="bg-white text-energia-900 font-semibold px-6 py-3 rounded-lg">Ver catálogo</a>
    <a href="/mis-solicitudes" class="border border-white text-white font-semibold px-6 py-3 rounded-lg">Mis solicitudes</a>
  </div>
</header>
<section class="max-w-7xl mx-auto py-12">
  <div class="flex justify-between items-center gap-3 mb-6"><h2 class="text-2xl font-bold">Equipos destacados</h2><a href="/catalogo" class="text-energia-700 underline">Todo el catálogo</a></div>
  {#if loading}<p>Cargando productos…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if products.length === 0}<p class="text-gray-600">Pronto encontrarás aquí los equipos disponibles.</p>
  {:else}<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each products as p (p.id)}
      <article class="bg-white border rounded-xl p-5 space-y-3"><h3 class="font-semibold text-lg">{p.name}</h3><p>{p.brand || ''} {p.model || ''}</p>
        <p class="font-semibold text-energia-700">{p.price == null ? 'Consultar precio' : `${Number(p.price).toLocaleString('es-CU')} ${p.currency || 'USD'}`}</p>
        <button onclick={() => consult(p)} class="bg-energia-600 text-white rounded-lg px-4 py-3 w-full">Consultar disponibilidad</button>
      </article>
    {/each}</div>
  {/if}
</section>
