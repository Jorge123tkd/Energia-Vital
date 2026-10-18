<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';

  let products: any[] = [];
  let categories: any[] = [];
  let selectedCategory: string | null = null;
  let search = '';
  let loading = true;

  onMount(async () => {
    try {
      const [p, c] = await Promise.all([api.getProducts(), api.getCategories()]);
      products = p.products ?? [];
      categories = c.categories ?? [];
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function filterByCategory(id: string) {
    selectedCategory = selectedCategory === id ? null : id;
  }

  function getFilteredProducts() {
    return products.filter((p) => {
      if (selectedCategory && p.category_id !== selectedCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="flex flex-col md:flex-row gap-6 mb-8 items-end">
    <div class="flex-1">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Catálogo de productos</h1>
      <p class="text-gray-600">Encuentra el equipo solar adecuado para tu hogar o negocio.</p>
    </div>
    <div class="flex-1 md:flex-1">
      <div class="relative">
        <input type="text" bind:value={search} placeholder="Buscar productos..." class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-energia-500 outline-none" />
        <span class="absolute left-3 top-3 text-gray-400">🔍</span>
      </div>
    </div>
  </div>

  <div class="flex gap-2 overflow-x-auto pb-6 scrollbar-hide">
    <button class="px-4 py-2 rounded-full whitespace-nowrap font-medium transition-colors" class:bg-energia-600 class:text-white={!selectedCategory} class:bg-gray-100 class:text-gray-600={selectedCategory} onclick={() => filterByCategory('')}>Todos</button>
    {#each categories as cat}
      <button class="px-4 py-2 rounded-full whitespace-nowrap font-medium transition-colors" class:bg-energia-600 class:text-white={selectedCategory === cat.id} class:bg-gray-100 class:text-gray-600={selectedCategory !== cat.id} onclick={() => filterByCategory(cat.id)}>
        {cat.name}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="text-center py-20">Cargando productos...</div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each getFilteredProducts() as product}
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
          {#if product.images && product.images.length > 0}
            <img src="{product.images[0].url || ''}" alt="{product.name}" class="w-full h-48 object-cover" />
          {:else}
            <div class="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400">Sin imagen</div>
          {/if}
          <div class="p-4">
            <h3 class="font-semibold text-gray-900 mb-1 group-hover:text-energia-600 transition-colors">{product.name}</h3>
            {#if product.brand}
              <p class="text-sm text-gray-500 mb-2">{product.brand} {product.model || ''}</p>
            {/if}
            {#if product.short_description}
              <p class="text-sm text-gray-600 mb-3 line-clamp-2">{product.short_description}</p>
            {/if}
            {#if product.price !== null && product.price !== undefined}
              <div class="text-energia-600 font-bold text-lg mb-3">${product.price.toLocaleString()} {product.currency}</div>
            {:else}
              <div class="text-gray-500 text-sm mb-3">Precio bajo consulta</div>
            {/if}
            <div class="flex gap-2">
              <button class="flex-1 bg-energia-600 text-white py-2 rounded-md text-sm font-medium hover:bg-energia-700 transition-colors">Consultar</button>
              <button class="w-10 bg-gray-100 text-gray-600 rounded-md text-sm hover:bg-gray-200 transition-colors" title="Detalles">
                <span class="sr-only">Detalles</span>ℹ️
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>