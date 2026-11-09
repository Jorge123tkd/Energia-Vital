<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let products: any[] = $state([]);
  let categories: any[] = $state([]);
  let category = $state('');
  let search = $state('');
  let loading = $state(true);
  let error = $state('');
  let selected: any = $state(null);
  onMount(async () => {
    try {
      const [p, c] = await Promise.all([api.getProducts(), api.getCategories()]);
      products = p.products ?? []; categories = c.categories ?? [];
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar el catálogo'; }
    finally { loading = false; }
  });
  function consult(product: any) { window.location.href = `/contacto?product=${encodeURIComponent(product.name)}`; }
  let filtered = $derived(products.filter(p => (!category || p.category_id === category) && (!search || [p.name, p.brand, p.model].some(x => String(x || '').toLowerCase().includes(search.toLowerCase())))));
</script>
<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-2">Catálogo solar</h1>
  <p class="text-gray-600 mb-7">Consulta nuestros equipos disponibles; la compatibilidad se confirma con un técnico.</p>
  <div class="flex flex-wrap gap-3 mb-7">
    <input aria-label="Buscar productos" placeholder="Buscar producto o marca" bind:value={search} class="border p-3 rounded-lg flex-1 min-w-48" />
    <select aria-label="Filtrar categoría" bind:value={category} class="border p-3 rounded-lg"><option value="">Todas las categorías</option>{#each categories as c}<option value={c.id}>{c.name}</option>{/each}</select>
  </div>
  {#if loading}<p>Cargando productos…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if filtered.length === 0}<p>No se encontraron equipos.</p>
  {:else}<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
    {#each filtered as product (product.id)}
      <article class="bg-white border rounded-xl overflow-hidden">
        {#if product.primary_image_url || product.images?.[0]?.url}<img class="w-full h-44 object-cover" src={product.primary_image_url || product.images[0].url} alt={product.name} />{:else}<div class="h-44 bg-gray-100 flex items-center justify-center text-gray-500">Imagen pendiente</div>{/if}
        <div class="p-5 space-y-2"><h2 class="font-semibold text-lg">{product.name}</h2><p class="text-sm text-gray-600">{product.brand || ''} {product.model || ''}</p><p class="text-sm text-slate-600 line-clamp-3">{product.short_description || product.description || 'Consulta las especificaciones con nuestro equipo.'}</p>
          <p class="font-semibold text-energia-700">{product.price == null ? 'Precio a consultar' : `${Number(product.price).toLocaleString('es-CU')} ${product.currency || 'USD'}`}</p>
          <div class="flex gap-2"><button class="flex-1 bg-energia-600 text-white rounded-lg py-2" onclick={() => consult(product)}>Consultar equipo</button><button class="border rounded-lg p-2" aria-label={`Detalles de ${product.name}`} onclick={() => selected = product}>Detalles</button></div>
        </div>
      </article>
    {/each}</div>
  {/if}
  {#if selected}
    <div class="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Detalle del producto" class="bg-white rounded-2xl p-6 max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between"><h2 class="text-xl font-bold">{selected.name}</h2><button aria-label="Cerrar detalles" onclick={() => selected = null}>✕</button></div>
        {#if selected.primary_image_url}<img src={selected.primary_image_url} alt={selected.name} class="w-full max-h-52 object-contain rounded-lg bg-slate-100" />{/if}
        {#if selected.brand || selected.model}<p class="text-sm text-slate-500">{selected.brand || ''} {selected.model || ''}</p>{/if}
        <p class="text-slate-700 whitespace-pre-line">{selected.description || selected.short_description || 'Consulta especificaciones y disponibilidad con Energía Vital.'}</p>
        {#if selected.specifications}<div class="rounded-xl bg-slate-50 p-4"><h3 class="font-semibold mb-2">Características técnicas</h3><p class="text-sm text-slate-700 whitespace-pre-line">{selected.specifications}</p></div>{/if}
        {#if selected.warranty_months}<p class="text-sm text-slate-600">Garantía: {selected.warranty_months} meses</p>{/if}
        <p class="font-bold text-teal-700">{selected.price == null ? 'Precio a consultar' : Number(selected.price).toLocaleString('es-CU') + ' ' + (selected.currency || 'USD')}</p>
        <button class="bg-energia-600 text-white rounded-lg py-2 px-4" onclick={() => consult(selected)}>Solicitar información</button>
      </section>
    </div>
  {/if}
</div>
