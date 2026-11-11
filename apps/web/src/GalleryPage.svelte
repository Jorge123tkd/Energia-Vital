<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let gallery: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  onMount(async () => {
    try { gallery = (await api.getGallery()).gallery ?? []; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo cargar la galería'; }
    finally { loading = false; }
  });
  function request(work: any) { window.location.href = `/contacto?reference=${encodeURIComponent(work.title)}`; }
</script>
<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-2">Trabajos de Bonaire</h1>
  <p class="text-gray-600 mb-8">Proyectos e instalaciones publicados por el equipo.</p>
  {#if loading}<p>Cargando…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if gallery.length === 0}<p>Aún no se han publicado trabajos.</p>
  {:else}<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each gallery as work (work.id)}
      <article class="bg-white border rounded-xl overflow-hidden">
        {#if work.url}<img class="w-full h-48 object-cover object-center" src={work.url} alt={work.title} />{:else}<div class="h-48 bg-gray-100"></div>{/if}
        <div class="p-5 space-y-2"><h2 class="font-semibold">{work.title}</h2><p class="text-sm text-gray-600">{work.description || ''}</p>
          <button class="bg-energia-600 text-white rounded-lg px-4 py-3 w-full" onclick={() => request(work)}>Quiero algo parecido</button>
        </div>
      </article>
    {/each}</div>
  {/if}
</div>
