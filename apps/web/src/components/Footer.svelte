<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let { settings = {} }: { settings?: Record<string, string> } = $props();
  let published: Record<string, string> = $state({});
  onMount(() => { api.getSettings().then(r => { published = r.settings ?? {}; }).catch(() => {}); });
  let site = $derived({ ...settings, ...published });
  const defaults = [
    { label: 'Inicio', url: '/' },
    { label: 'Catálogo solar', url: '/catalogo' },
    { label: 'Servicios', url: '/servicios' },
    { label: 'Nuestros trabajos', url: '/galeria' },
    { label: 'Asesor solar', url: '/asesor-solar' }
  ];
  let links = $derived.by(() => {
    if (site.footer_links === undefined) return defaults;
    try {
      const items = JSON.parse(site.footer_links);
      if (!Array.isArray(items)) return defaults;
      return items.filter((item: any) => item && typeof item.label === 'string' && typeof item.url === 'string'
        && (/^\/(?!\/)/.test(item.url) || /^https:\/\//i.test(item.url)));
    } catch { return defaults; }
  });
  let social = $derived([
    { label: 'YouTube', url: site.youtube_channel_url },
    { label: 'Facebook', url: site.facebook_url },
    { label: 'Instagram', url: site.instagram_url },
    { label: 'Telegram', url: site.telegram_public_url }
  ].filter(link => link.url && /^https:\/\/[^\s]+$/i.test(link.url)));
  let whatsapp = $derived((site.business_phone || '+5356085711').replace(/\D/g, ''));
</script>

<footer class="bg-slate-950 text-slate-100 mt-auto border-t border-slate-800">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-7">
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
      <div class="lg:col-span-1">
        <a href="/" class="font-bold text-xl text-white flex items-center gap-2 mb-4"><span class="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-sm">EV</span> Energía Vital</a>
        <p class="text-slate-400 text-sm leading-relaxed">{site.footer_description || 'Soluciones de energía solar para tu hogar y negocio. Venta de equipos, instalación, mantenimiento y asesoría personalizada.'}</p>
      </div>
      <div>
        <h3 class="text-white font-semibold mb-5">Explorar</h3>
        <ul class="space-y-3 text-sm">{#each links as link}
          <li><a href={link.url} target={link.url.startsWith('https://') ? '_blank' : undefined} rel={link.url.startsWith('https://') ? 'noopener noreferrer' : undefined} class="text-slate-400 hover:text-teal-300 transition">{link.label}</a></li>
        {/each}</ul>
      </div>
      <div>
        <h3 class="text-white font-semibold mb-5">Contacto</h3>
        <ul class="space-y-3 text-sm text-slate-400">
          {#if site.business_phone || whatsapp}<li><a href={'https://wa.me/' + whatsapp} target="_blank" rel="noopener noreferrer" class="hover:text-teal-300">WhatsApp: {site.business_phone || '+53 5608 5711'}</a></li>{/if}
          <li><a href={'mailto:' + (site.business_email || 'info@energiavital.com')} class="hover:text-teal-300">{site.business_email || 'info@energiavital.com'}</a></li>
          {#if site.business_address}<li>{site.business_address}</li>{/if}
          {#if site.business_hours}<li>{site.business_hours}</li>{/if}
        </ul>
      </div>
      <div>
        <h3 class="text-white font-semibold mb-5">Síguenos</h3>
        {#if social.length}
          <div class="flex flex-wrap gap-2">{#each social as item}<a href={item.url} target="_blank" rel="noopener noreferrer" class="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-teal-500">{item.label}</a>{/each}</div>
        {:else}
          <p class="text-sm text-slate-500">Muy pronto compartiremos novedades y proyectos en nuestras redes.</p>
        {/if}
      </div>
    </div>
    <div class="border-t border-slate-800 pt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span>© {new Date().getFullYear()} Energía Vital. Todos los derechos reservados.</span>
      <span>Energía para avanzar.</span>
    </div>
  </div>
</footer>
