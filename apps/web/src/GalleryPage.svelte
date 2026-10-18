<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';

  let gallery: any[] = [];
  let loading = true;

  onMount(async () => {
    try {
      const res = await api.getGallery();
      gallery = res.gallery ?? [];
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Nuestros trabajos</h1>
    <p class="text-gray-600">Instalaciones, reparaciones y proyectos reales de Energía Vital.</p>
  </div>

  {#if loading}
    <div class="text-center py-20">Cargando galería...</div>
  {:else if gallery.length === 0}
    <div class="text-center py-20 text-gray-500">No hay trabajos publicados aún.</div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each gallery as work}
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
          {#if work.url}
            <img src="{work.url}" alt="{work.title}" class="w-full h-48 object-cover group-hover:scale-105 transition-transform" />
          {:else}
            <div class="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">Sin imagen</div>
          {/if}
          <div class="p-4">
            <h3 class="font-semibold text-gray-900 mb-1">{work.title}</h3>
            {#if work.category}
              <p class="text-xs text-energia-600 font-medium mb-2 uppercase">{work.category}</p>
            {/if}
            {#if work.description}
              <p class="text-sm text-gray-600 mb-3 line-clamp-2">{work.description}</p>
            {/if}
            <button class="w-full bg-energia-600 text-white py-2 rounded-md text-sm font-medium hover:bg-energia-700 transition-colors">
              Quiero algo parecido
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>