<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { isAssistantOpen } from './lib/store';

  let products: any[] = $state([]);
  let settings: any = {};
  let loading = $state(true);

  onMount(async () => {
    try {
      const [p, s] = await Promise.all([api.getProducts({ featured: 'true' }), api.getSettings()]);
      products = p.products ?? [];
      settings = s.settings ?? {};
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function openAssistant() {
    isAssistantOpen.set(true);
  }
</script>

<header class="relative overflow-hidden">
  <div class="absolute inset-0 bg-energia-900/90">
    <div class="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1509391366360-2e959784a276?w=1920&q=80')] bg-cover bg-center opacity-30"></div>
  </div>
  <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
    <h1 class="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
      Energía Vital<br />
      <span class="text-energia-400">Tu asistente solar inteligente</span>
    </h1>
    <p class="text-lg text-gray-200 mb-8 max-w-2xl mx-auto">
      Dime qué necesitas y te guiaré paso a paso. Equipos solares, inversores, baterías, estaciones EcoFlow, instalación y mantenimiento.
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <button class="bg-energia-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-energia-700 transition-colors" onclick={openAssistant}>
        Hablar con el asistente
      </button>
      <button class="bg-white text-energia-900 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors" onclick={() => document.getElementById('catalogo-section')?.scrollIntoView()}>
        Ver catálogo
      </button>
    </div>
  </div>
</header>

<section id="catalogo-section" class="py-16 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center mb-8">
      <h2 class="text-2xl font-bold text-gray-900">Productos destacados</h2>
      <a href="/catalogo" class="text-energia-600 font-medium hover:underline">Ver todos →</a>
    </div>

    {#if loading}
      <div class="text-center py-20">Cargando productos...</div>
    {:else if products.length === 0}
      <div class="text-center py-20 text-gray-500">No hay productos disponibles.</div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each products as product}
          <div class="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
            {#if product.images && product.images[0]}
              <img src="{product.images[0].url || ''}" alt="{product.name}" class="w-full h-48 object-cover" />
            {:else}
              <div class="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">Sin imagen</div>
            {/if}
            <div class="p-4">
              <h3 class="font-semibold text-gray-900 mb-1">{product.name}</h3>
              {#if product.brand}
                <p class="text-sm text-gray-500 mb-2">{product.brand} {product.model || ''}</p>
              {/if}
              {#if product.price !== null && product.price !== undefined}
                <div class="text-energia-600 font-bold text-lg mb-3">${product.price.toLocaleString()} {product.currency}</div>
              {/if}
              <button class="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors text-sm">
                Consultar disponibilidad
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<section class="py-16 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
    <h2 class="text-2xl font-bold text-gray-900 mb-6">¿Necesitas ayuda?</h2>
    <p class="text-gray-600 mb-8 max-w-2xl mx-auto">
      Nuestro asistente está listo para ayudarte a encontrar el equipo solar adecuado, agendar una cita o resolver dudas sobre instalación y mantenimiento.
    </p>
  </div>
</section>
