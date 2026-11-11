<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let { onAssistant }: { onAssistant: () => void } = $props();
  import CatalogPage from './CatalogPage.svelte';
  import ServicesPage from './ServicesPage.svelte';
  import GalleryPage from './GalleryPage.svelte';
  let settings: Record<string, string> = $state({});
  const intro = 'Paneles solares, inversores, baterías y servicios de instalación y mantenimiento. Explora nuestro catálogo y recibe asesoramiento profesional para tu hogar o negocio.';
  onMount(() => {
    void (async () => {
      try { settings = (await api.getSettings()).settings ?? {}; }
      catch { /* The home banner keeps its defaults if settings are unavailable. */ }
    })();
    const interval = window.setInterval(() => {
      if (!document.hidden) activeSlide = (activeSlide + 1) % 3;
    }, 7500);
    return () => window.clearInterval(interval);
  });
  type Slide = { title: string; subtitle: string; image_url: string; link_label: string; link_url: string };
  let activeSlide = $state(0);
  const defaults: Slide[] = [
    { title: 'Bonaire', subtitle: intro, image_url: '', link_label: 'Explorar equipos', link_url: '/catalogo' },
    { title: 'Trabajos que hablan por nosotros', subtitle: 'Conoce nuestros proyectos e instalaciones de energía solar.', image_url: '', link_label: 'Ver nuestros trabajos', link_url: '/galeria' },
    { title: 'Novedades y soluciones solares', subtitle: 'Descubre equipos disponibles y consulta las propuestas que mejor se adaptan a ti.', image_url: '', link_label: 'Ver catálogo', link_url: '/catalogo' }
  ];
  let slides = $derived.by((): Slide[] => {
    try {
      const parsed = JSON.parse(settings.home_slides || '');
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((s: any) =>
        typeof s.title === 'string' && typeof s.subtitle === 'string' &&
        typeof s.image_url === 'string' && typeof s.link_label === 'string' &&
        typeof s.link_url === 'string')) return parsed.map((s: Slide) => ({
          ...s, title: s.title === 'Energía Vital' ? 'Bonaire' : s.title
        }));
    } catch { /* configuración inicial: usar títulos por defecto */ }
    return [{ ...defaults[0], title: settings.home_title === 'Energía Vital' ? 'Bonaire' : settings.home_title || defaults[0].title,
      subtitle: settings.home_subtitle || intro }, defaults[1], defaults[2]];
  });
  let slide = $derived(slides[activeSlide] || slides[0]);
  function selectSlide(index: number) { activeSlide = (index + 3) % 3; }
</script>

<section aria-label="Presentación de Bonaire" class="relative rounded-3xl overflow-hidden min-h-[440px] sm:min-h-[500px] bg-slate-950 text-white flex flex-col justify-between shadow-xl">
  {#if slide.image_url && /^https:\/\/[^\s]+$/i.test(slide.image_url)}
    <img src={slide.image_url} alt="" class="absolute inset-0 w-full h-full object-cover" />
    <div class="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-900/25"></div>
  {:else}
    <div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-teal-950 to-teal-700"></div>
    <div class="absolute -right-20 -top-20 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl"></div>
  {/if}
  <div class="relative px-6 py-16 sm:px-14 sm:py-20 max-w-3xl flex-1">
    <span class="inline-flex items-center px-4 py-2 border border-white/25 bg-white/10 rounded-full text-sm text-teal-50 mb-7">☀ Bonaire · {activeSlide + 1} de 3</span>
    <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6">{slide.title}</h1>
    <p class="text-lg sm:text-xl text-teal-50 leading-relaxed mb-8 max-w-2xl">{slide.subtitle}</p>
    <div class="flex flex-wrap gap-3">
      <a href={slide.link_url} target={slide.link_url.startsWith('https://') ? '_blank' : undefined}
        rel={slide.link_url.startsWith('https://') ? 'noopener noreferrer' : undefined}
        class="inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-bold bg-white text-teal-950 hover:bg-teal-50">
        {slide.link_label || 'Conocer más'} →
      </a>
      <button onclick={onAssistant} class="px-5 py-3.5 rounded-xl border border-white/40 bg-white/10 font-semibold hover:bg-white/20">Hablar con el asistente</button>
    </div>
  </div>
  <div class="relative px-6 pb-6 sm:px-14 flex items-center justify-between gap-4">
    <div class="flex items-center gap-2" role="group" aria-label="Seleccionar diapositiva">
      {#each slides as item, index}
        <button type="button" aria-label={'Mostrar diapositiva ' + (index + 1) + ': ' + item.title}
          aria-current={activeSlide === index ? 'true' : undefined}
          onclick={() => selectSlide(index)}
          class="h-2.5 rounded-full transition-all {activeSlide === index ? 'w-10 bg-white' : 'w-3 bg-white/40 hover:bg-white/70'}"></button>
      {/each}
    </div>
    <div class="flex gap-2">
      <button type="button" aria-label="Diapositiva anterior" onclick={() => selectSlide(activeSlide - 1)}
        class="border border-white/40 rounded-full w-11 h-11 hover:bg-white/15 text-xl">‹</button>
      <button type="button" aria-label="Diapositiva siguiente" onclick={() => selectSlide(activeSlide + 1)}
        class="border border-white/40 rounded-full w-11 h-11 hover:bg-white/15 text-xl">›</button>
    </div>
  </div>
</section>


<section class="max-w-7xl mx-auto py-8" aria-label="Productos destacados">
  <div class="flex flex-wrap justify-between items-end gap-3 mb-6">
    <h2 class="text-2xl sm:text-3xl font-bold text-slate-900">Productos destacados</h2>
    <a href="/catalogo" class="text-teal-800 font-semibold hover:underline">Ver catálogo completo →</a>
  </div>
  <CatalogPage featured />
</section>

<section class="max-w-7xl mx-auto py-8" aria-label="Servicios destacados">
  <div class="flex flex-wrap justify-between items-end gap-3 mb-6">
    <h2 class="text-2xl sm:text-3xl font-bold text-slate-900">Servicios destacados</h2>
    <a href="/servicios" class="text-teal-800 font-semibold hover:underline">Ver todos los servicios →</a>
  </div>
  <ServicesPage featured />
</section>

<section class="max-w-7xl mx-auto py-8" aria-label="Galerías destacadas">
  <div class="flex flex-wrap justify-between items-end gap-3 mb-6">
    <h2 class="text-2xl sm:text-3xl font-bold text-slate-900">Galerías destacadas</h2>
    <a href="/galeria" class="text-teal-800 font-semibold hover:underline">Ver todos los proyectos →</a>
  </div>
  <GalleryPage featured />
</section>
