<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import ProductReviews from './components/ProductReviews.svelte';

  type Product = {
    id: string; name: string; category_id?: string; category_name?: string;
    brand?: string; model?: string; short_description?: string; description?: string;
    price?: number | null; currency?: string; primary_image_url?: string;
    stock_status?: string; is_featured?: number | boolean;
    specifications?: string; compatibility?: string; warranty_months?: number | null;
  };
  type Category = { id: string; name: string };

  let products: Product[] = $state([]);
  let categories: Category[] = $state([]);
  let category = $state('');
  let search = $state('');
  let order = $state<'recommended' | 'name' | 'price_asc' | 'price_desc'>('recommended');
  let loading = $state(true);
  let error = $state('');
  let selected: Product | null = $state(null);
  let selectedImages: string[] = $state([]);
  let selectedImageIndex = $state(0);
  let loadingDetails = $state(false);

  function normalize(value: unknown) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  let filtered = $derived.by(() => {
    const term = normalize(search.trim());
    const items = products.filter(p =>
      (!category || p.category_id === category) &&
      (!term || [p.name, p.brand, p.model, p.category_name, p.short_description]
        .some(v => normalize(v).includes(term)))
    );
    if (order === 'name') return [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (order === 'price_asc' || order === 'price_desc') {
      const direction = order === 'price_asc' ? 1 : -1;
      return [...items].sort((a, b) => {
        if (a.price == null) return b.price == null ? 0 : 1;
        if (b.price == null) return -1;
        return (Number(a.price) - Number(b.price)) * direction;
      });
    }
    return items;
  });

  async function loadCatalog() {
    loading = true;
    error = '';
    try {
      const [p, c] = await Promise.all([api.getProducts(), api.getCategories()]);
      products = p.products ?? [];
      categories = c.categories ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'No se pudo cargar el catálogo.';
    } finally {
      loading = false;
    }
  }
  onMount(() => { void loadCatalog(); });

  function imageOf(product: Product) {
    return product.primary_image_url || '';
  }
  function priceLabel(product: Product) {
    return product.price == null
      ? 'Precio a consultar'
      : Number(product.price).toLocaleString('es-CU', { maximumFractionDigits: 2 }) + ' ' + (product.currency || 'USD');
  }
  function stockLabel(product: Product) {
    if (product.stock_status === 'in_stock') return 'Disponible';
    if (product.stock_status === 'out_of_stock') return 'Agotado';
    if (product.stock_status === 'on_order') return 'Bajo pedido';
    return '';
  }
  function consult(product: Product) {
    window.location.href = '/contacto?product=' + encodeURIComponent(product.name);
  }
  async function details(product: Product) {
    selected = product;
    selectedImageIndex = 0;
    selectedImages = imageOf(product) ? [imageOf(product)] : [];
    loadingDetails = true;
    try {
      const response = await api.getProduct(product.id);
      if (selected?.id !== product.id) return;
      const merged: Product = { ...product, ...(response.product || {}) };
      selected = merged;
      const all = [merged.primary_image_url, ...(response.images || []).map((img: any) => img.url)]
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      selectedImages = [...new Set(all)];
    } catch {
      // La ficha básica y la imagen de portada siguen disponibles sin la petición adicional.
    } finally {
      loadingDetails = false;
    }
  }
  function closeDetails() {
    selected = null;
    selectedImages = [];
    loadingDetails = false;
  }
  function resetFilters() {
    search = '';
    category = '';
    order = 'recommended';
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && selected) closeDetails(); }} />

<div class="w-full min-w-0 pb-12">
  <header class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 px-5 py-9 sm:px-10 sm:py-12 xl:px-12 xl:py-14 text-white shadow-xl">
    <div class="relative z-10 max-w-3xl">
      <span class="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs sm:text-sm font-bold tracking-wide text-teal-100">☀ Bonaire · Equipos solares</span>
      <h1 class="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight mt-5">Encuentra la energía que necesitas</h1>
      <p class="text-teal-50/90 text-sm sm:text-lg leading-relaxed mt-4 max-w-2xl">Explora paneles, baterías, inversores y accesorios. Compara opciones y consulta con nuestro equipo antes de elegir.</p>
      <div class="flex flex-wrap items-center gap-3 mt-6">
        <a href="/asesor-solar" class="inline-flex items-center justify-center rounded-xl bg-white text-teal-950 font-extrabold text-sm px-5 py-3 hover:bg-teal-50">Ayúdame a elegir →</a>
        <a href="/servicios" class="inline-flex items-center justify-center rounded-xl border border-white/35 bg-white/10 text-white font-semibold text-sm px-5 py-3 hover:bg-white/20">Ver servicios</a>
      </div>
    </div>
    <div class="pointer-events-none absolute -right-20 -top-32 w-96 h-96 rounded-full bg-teal-400/15 blur-3xl"></div>
    <div class="pointer-events-none absolute right-8 -bottom-24 w-60 h-60 rounded-full bg-amber-200/10 blur-3xl"></div>
  </header>

  <section aria-label="Buscar y filtrar equipos" class="relative bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-5 mt-6 space-y-4">
    <div class="flex flex-col lg:flex-row lg:items-end gap-3">
      <label class="flex-1 min-w-0 text-xs uppercase tracking-wide font-bold text-slate-500">
        Buscar en el catálogo
        <div class="flex items-center gap-2 border border-slate-300 rounded-xl bg-white px-3 mt-2 focus-within:ring-2 focus-within:ring-teal-200 focus-within:border-teal-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-slate-400" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="search" bind:value={search} aria-label="Buscar equipos por nombre, marca o categoría" placeholder="Ej. panel 550 W, batería, inversor…" class="w-full min-w-0 py-3 outline-none text-sm text-slate-900 placeholder:text-slate-400" />
        </div>
      </label>
      <label class="text-xs uppercase tracking-wide font-bold text-slate-500 lg:w-52">
        Ordenar por
        <select bind:value={order} class="block bg-white border border-slate-300 rounded-xl w-full px-3 py-3 mt-2 text-sm text-slate-800 font-medium focus:outline-teal-600">
          <option value="recommended">Recomendados</option>
          <option value="name">Nombre (A–Z)</option>
          <option value="price_asc">Menor precio</option>
          <option value="price_desc">Mayor precio</option>
        </select>
      </label>
    </div>
    <div class="space-y-2">
      <p class="text-xs uppercase tracking-wide font-bold text-slate-500">Categorías</p>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        <button type="button" aria-pressed={category === ''} onclick={() => category = ''}
          class="rounded-full px-4 py-2 text-xs sm:text-sm font-bold border transition {category === '' ? 'bg-teal-700 text-white border-teal-700 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'}">Todos los equipos</button>
        {#each categories as c (c.id)}
          <button type="button" aria-pressed={category === c.id} onclick={() => category = c.id}
            class="rounded-full px-4 py-2 text-xs sm:text-sm font-semibold border transition {category === c.id ? 'bg-teal-700 text-white border-teal-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'}">{c.name}</button>
        {/each}
      </div>
    </div>
  </section>

  <div class="flex flex-wrap items-center justify-between gap-3 mt-7 mb-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">Nuestros equipos</h2>
      <p class="text-sm text-slate-500 mt-1">{loading ? 'Cargando el catálogo…' : filtered.length + ' ' + (filtered.length === 1 ? 'equipo encontrado' : 'equipos encontrados')}</p>
    </div>
    {#if search || category || order !== 'recommended'}
      <button type="button" class="text-sm text-teal-800 underline font-bold" onclick={resetFilters}>Limpiar filtros</button>
    {/if}
  </div>

  {#if loading}
    <div class="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4" aria-label="Cargando equipos">
      {#each [1, 2, 3, 4, 5] as n}
        <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-pulse" aria-hidden="true">
          <div class="h-40 bg-slate-100"></div>
          <div class="space-y-3 p-4"><div class="h-4 bg-slate-100 rounded"></div><div class="h-3 bg-slate-100 rounded w-3/4"></div><div class="h-9 bg-slate-100 rounded mt-5"></div></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800" role="alert">
      <h3 class="font-bold">No pudimos cargar el catálogo</h3>
      <p class="mt-1 text-sm">{error}</p>
      <button type="button" class="rounded-xl bg-teal-700 text-white px-4 py-2.5 mt-4 text-sm font-bold" onclick={() => loadCatalog()}>Volver a intentar</button>
    </div>
  {:else if !filtered.length}
    <div class="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-2xl">⌕</div>
      <h3 class="text-xl font-extrabold text-slate-900 mt-4">{products.length ? 'No encontramos equipos con esos filtros' : 'Próximamente: nuestros equipos solares'}</h3>
      <p class="text-slate-500 mt-2 text-sm">{products.length ? 'Prueba con otra palabra o selecciona todas las categorías.' : 'Estamos preparando el catálogo. Puedes solicitar orientación sobre un sistema solar.'}</p>
      {#if products.length}
        <button type="button" onclick={resetFilters} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3 mt-5">Mostrar todos</button>
      {:else}
        <a href="/asesor-solar" class="inline-flex rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3 mt-5">Ir al asesor solar</a>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
      {#each filtered as product (product.id)}
        <article class="min-w-0 flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-teal-200 transition">
          <button type="button" class="relative block w-full text-left bg-gradient-to-br from-teal-50 to-slate-100 overflow-hidden" onclick={() => details(product)} aria-label={'Ver detalles de ' + product.name}>
            {#if imageOf(product)}
              <img src={imageOf(product)} alt={product.name} loading="lazy" class="w-full h-40 sm:h-44 object-cover object-center hover:scale-105 transition-transform duration-300" />
            {:else}
              <div class="h-40 sm:h-44 flex flex-col items-center justify-center gap-2 text-teal-700">
                <span class="text-4xl" aria-hidden="true">☀</span>
                <span class="text-xs font-semibold text-slate-500">Imagen próximamente</span>
              </div>
            {/if}
            {#if product.is_featured}
              <span class="absolute top-2 left-2 rounded-full bg-amber-100 text-amber-900 px-2.5 py-1 text-[10px] font-extrabold shadow-sm">Destacado</span>
            {/if}
          </button>
          <div class="flex flex-col flex-1 p-3.5 sm:p-4">
            <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
              <p class="text-[11px] font-bold uppercase tracking-wide text-teal-700 truncate">{product.category_name || 'Energía solar'}</p>
              {#if stockLabel(product)}
                <span class="text-[10px] font-semibold {product.stock_status === 'in_stock' ? 'text-emerald-700' : product.stock_status === 'out_of_stock' ? 'text-red-700' : 'text-slate-500'}">{stockLabel(product)}</span>
              {/if}
            </div>
            <h3 class="text-sm sm:text-base font-extrabold leading-snug text-slate-900 line-clamp-2 min-h-10">{product.name}</h3>
            {#if product.brand || product.model}
              <p class="text-xs text-slate-500 mt-1 line-clamp-1">{[product.brand, product.model].filter(Boolean).join(' · ')}</p>
            {/if}
            <p class="text-xs text-slate-600 leading-relaxed mt-2 line-clamp-2 flex-1">{product.short_description || product.description || 'Consulta características, precio y compatibilidad con el equipo de Bonaire.'}</p>
            <div class="border-t border-slate-100 mt-4 pt-3">
              <p class="text-sm sm:text-base font-extrabold text-teal-800 break-words">{priceLabel(product)}</p>
              <div class="grid grid-cols-2 gap-2 mt-3">
                <button type="button" class="rounded-xl border border-teal-200 bg-teal-50 text-teal-900 px-2 py-2.5 font-bold text-xs hover:bg-teal-100" onclick={() => details(product)}>Detalles</button>
                <button type="button" class="rounded-xl bg-teal-700 text-white px-2 py-2.5 font-bold text-xs hover:bg-teal-800" onclick={() => consult(product)}>Consultar</button>
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}

  <aside class="mt-9 rounded-2xl border border-teal-100 bg-teal-50/70 px-5 py-6 sm:px-7 flex flex-wrap items-center justify-between gap-4">
    <div class="max-w-xl">
      <h2 class="text-lg font-extrabold text-slate-900">¿No sabes qué equipo necesitas?</h2>
      <p class="text-sm text-slate-600 mt-1">Utiliza el asesor solar paso a paso. El resultado es orientativo y nuestro equipo puede revisar tu instalación.</p>
    </div>
    <a href="/asesor-solar" class="inline-flex items-center justify-center rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm px-5 py-3">Empezar asesoramiento →</a>
  </aside>
</div>

{#if selected}
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5">
    <button type="button" class="absolute inset-0 bg-slate-950/75 cursor-default" aria-label="Cerrar detalles del producto" onclick={closeDetails}></button>
    <dialog open aria-label={'Detalles de ' + selected.name} class="relative m-0 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <div class="sticky top-0 z-10 flex items-start justify-between gap-4 bg-white border-b border-slate-100 px-5 py-4 sm:px-7">
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wider font-bold text-teal-700">{selected.category_name || 'Catálogo Bonaire'}</p>
          <h2 class="text-xl sm:text-2xl font-extrabold text-slate-950 mt-1 break-words">{selected.name}</h2>
        </div>
        <button type="button" class="shrink-0 rounded-xl bg-slate-100 hover:bg-slate-200 w-10 h-10 text-slate-700 font-bold" aria-label="Cerrar detalles" onclick={closeDetails}>✕</button>
      </div>
      <div class="grid md:grid-cols-2 gap-6 p-5 sm:p-7">
        <div class="min-w-0">
          {#if selectedImages.length}
            <img src={selectedImages[selectedImageIndex] || selectedImages[0]} alt={selected.name} class="w-full h-56 sm:h-72 object-contain rounded-2xl bg-gradient-to-br from-teal-50 to-slate-100 p-4" />
            {#if selectedImages.length > 1}
              <div class="flex gap-2 overflow-x-auto py-3" aria-label="Imágenes del equipo">
                {#each selectedImages as image, i}
                  <button type="button" aria-label={'Mostrar imagen ' + (i + 1)} aria-pressed={selectedImageIndex === i} class="shrink-0 rounded-xl border-2 {selectedImageIndex === i ? 'border-teal-700' : 'border-slate-200'} p-1" onclick={() => selectedImageIndex = i}>
                    <img src={image} alt="" class="w-16 h-14 object-contain rounded-lg" />
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="h-56 sm:h-72 rounded-2xl bg-teal-50 flex flex-col items-center justify-center text-slate-500">
              <span class="text-5xl" aria-hidden="true">☀</span>
              <p class="text-sm mt-3">Sin fotografía del equipo</p>
            </div>
          {/if}
          {#if loadingDetails}<p class="text-xs text-slate-500 mt-2">Cargando información adicional…</p>{/if}
        </div>
        <div class="min-w-0 flex flex-col gap-4">
          {#if selected.brand || selected.model}<p class="text-sm text-slate-500">{[selected.brand, selected.model].filter(Boolean).join(' · ')}</p>{/if}
          <p class="text-sm leading-relaxed text-slate-700 whitespace-pre-line">{selected.description || selected.short_description || 'Solicita más información sobre este equipo.'}</p>
          {#if selected.specifications}
            <section class="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <h3 class="text-sm font-extrabold text-slate-900 mb-2">Características técnicas</h3>
              <p class="text-xs sm:text-sm text-slate-700 whitespace-pre-line break-words">{selected.specifications}</p>
            </section>
          {/if}
          {#if selected.compatibility}<p class="text-xs sm:text-sm text-slate-600"><strong>Compatibilidad:</strong> {selected.compatibility}</p>{/if}
          {#if selected.warranty_months}<p class="text-xs sm:text-sm text-slate-600"><strong>Garantía:</strong> {selected.warranty_months} meses</p>{/if}
          {#if stockLabel(selected)}<p class="text-xs font-semibold text-slate-600">Estado: {stockLabel(selected)}</p>{/if}
          <div class="mt-auto border-t border-slate-200 pt-4">
            <p class="text-2xl font-extrabold text-teal-800">{priceLabel(selected)}</p>
            <button type="button" class="w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold px-5 py-3.5 mt-4" onclick={() => { if (selected) consult(selected); }}>Consultar este equipo →</button>
            <p class="mt-3 text-xs text-slate-500">La disponibilidad y compatibilidad se confirman con el equipo de Bonaire.</p>
          </div>
        </div>
      </div>
      <div class="px-5 sm:px-7 pb-6"><ProductReviews productId={selected.id} /></div>
    </dialog>
  </div>
{/if}
