<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let services: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  onMount(() => {
    api.getServices().then(r => { services = r.services ?? []; })
      .catch(e => error = e instanceof Error ? e.message : 'No se pudieron cargar los servicios.')
      .finally(() => loading = false);
  });
  function request(service: any) { window.location.href = '/contacto?service=' + encodeURIComponent(service.name); }
</script>

<section class="max-w-7xl mx-auto px-2 py-8">
  <div class="mb-9">
    <span class="text-xs font-bold tracking-widest uppercase text-teal-700">Asistencia especializada</span>
    <h1 class="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Servicios de Bonaire</h1>
    <p class="text-slate-600 mt-3 max-w-2xl">Desde la planificación hasta el mantenimiento. Te acompañamos para aprovechar al máximo tu inversión solar.</p>
  </div>
  {#if loading}<p class="text-slate-500">Cargando servicios…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if services.length === 0}<div class="rounded-2xl bg-white p-8 border border-slate-200 text-slate-600">Pronto publicaremos nuestros servicios.</div>
  {:else}<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each services as s (s.id)}
      <article class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col hover:shadow-md transition">
        {#if s.image_url}<img class="w-full h-52 object-cover object-center" src={s.image_url} alt={s.name} />{:else}<div class="h-52 bg-gradient-to-br from-teal-50 to-slate-100 flex items-center justify-center text-slate-400">Servicio solar</div>{/if}
        <div class="p-6 space-y-3 flex-1 flex flex-col">
          <h2 class="text-xl font-bold text-slate-900">{s.name}</h2>
          <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{s.description || 'Consulta todos los detalles del servicio con nuestro equipo.'}</p>
          {#if s.scope}<p class="text-sm text-slate-500 border-l-2 border-teal-400 pl-3 whitespace-pre-line">{s.scope}</p>{/if}
          <div class="mt-auto pt-4">
            <p class="font-bold text-teal-800 mb-4">{s.price_type === 'fixed' && s.price != null ? Number(s.price).toLocaleString('es-CU') + ' USD' : s.price_type === 'free' ? 'Gratuito' : 'Precio bajo presupuesto'}</p>
            <button class="w-full bg-teal-700 hover:bg-teal-800 text-white rounded-xl px-5 py-3 font-semibold" onclick={() => request(s)}>Solicitar este servicio</button>
          </div>
        </div>
      </article>
    {/each}
  </div>{/if}
</section>
