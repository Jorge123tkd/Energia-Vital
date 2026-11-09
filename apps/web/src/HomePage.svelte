<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let { onAssistant }: { onAssistant: () => void } = $props();
  let products: any[] = $state([]);
  let settings: Record<string, string> = $state({});
  let loading = $state(true);
  let error = $state('');
  const intro = 'Paneles solares, inversores, baterías y servicios de instalación y mantenimiento. Explora nuestro catálogo y recibe asesoramiento profesional para tu hogar o negocio.';
  onMount(() => {
    void (async () => {
      const [items, config] = await Promise.allSettled([api.getProducts({ featured: 'true' }), api.getSettings()]);
      if (items.status === 'fulfilled') products = items.value.products ?? [];
      else error = 'No se pudieron cargar los equipos destacados.';
      if (config.status === 'fulfilled') settings = config.value.settings ?? {};
      loading = false;
    })();
  });
  function consult(p: any) { window.location.href = '/contacto?product=' + encodeURIComponent(p.name); }
</script>

<header class="rounded-3xl overflow-hidden relative bg-gradient-to-br from-slate-950 via-teal-950 to-teal-700 text-white">
  <div class="absolute -right-24 -top-28 w-80 h-80 rounded-full bg-teal-400/15 blur-3xl pointer-events-none"></div>
  <div class="absolute -left-24 -bottom-28 w-96 h-96 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none"></div>
  <div class="relative py-16 sm:py-24 px-6 sm:px-14 max-w-4xl">
    <span class="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/15 rounded-full text-sm text-teal-100 mb-6">☀ Energía solar para Cuba</span>
    <h1 class="text-4xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">{settings.home_title || 'Energía Vital'}</h1>
    <p class="text-lg sm:text-xl text-teal-50/90 leading-relaxed mb-9">{settings.home_subtitle || intro}</p>
    <div class="flex flex-wrap gap-3">
      <a href="/catalogo" class="bg-white text-teal-950 font-semibold px-6 py-3 rounded-xl shadow-sm hover:bg-teal-50">Explorar equipos</a>
      <a href="/servicios" class="border border-white/50 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10">Nuestros servicios</a>
      <button onclick={onAssistant} class="bg-teal-600/80 border border-teal-400 text-white font-semibold px-6 py-3 rounded-xl hover:bg-teal-600">Asesoramiento</button>
    </div>
  </div>
</header>

<section class="max-w-7xl mx-auto py-12">
  <div class="flex flex-wrap justify-between items-end gap-3 mb-6">
    <div><p class="text-teal-700 uppercase font-semibold text-xs tracking-wider mb-2">Equipos solares</p><h2 class="text-3xl font-bold text-slate-900">Productos destacados</h2><p class="text-slate-600 mt-2">Soluciones seleccionadas para diferentes necesidades energéticas.</p></div>
    <a href="/catalogo" class="text-teal-800 font-semibold hover:underline">Ver catálogo completo →</a>
  </div>
  {#if loading}
    <p class="text-slate-500">Cargando equipos destacados…</p>
  {:else if error}
    <p role="alert" class="text-red-700">{error}</p>
  {:else if products.length === 0}
    <div class="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600">Pronto encontrarás aquí nuestros equipos destacados. Mientras tanto, puedes consultar los servicios disponibles.</div>
  {:else}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each products as p (p.id)}
        <article class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
          {#if p.primary_image_url}<img class="w-full h-52 object-cover" src={p.primary_image_url} alt={p.name} />{:else}<div class="h-52 bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center text-slate-400">Fotografía próximamente</div>{/if}
          <div class="p-5 space-y-3">
            <p class="text-xs font-semibold text-teal-700">{p.category_name || 'Energía solar'}</p>
            <h3 class="font-semibold text-xl">{p.name}</h3>
            <p class="text-slate-600 text-sm line-clamp-3">{p.short_description || p.description || [p.brand, p.model].filter(Boolean).join(' ') || 'Consulta características y disponibilidad.'}</p>
            <div class="flex items-center justify-between gap-3 pt-2"><strong class="text-teal-800">{p.price == null ? 'Precio a consultar' : Number(p.price).toLocaleString('es-CU') + ' ' + (p.currency || 'USD')}</strong><button onclick={() => consult(p)} class="bg-teal-700 text-white rounded-xl px-4 py-2 font-medium hover:bg-teal-800">Consultar</button></div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
