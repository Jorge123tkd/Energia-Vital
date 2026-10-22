<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';

  let services: any[] = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await api.getServices();
      services = res.services ?? [];
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 class="text-3xl font-bold text-gray-900 mb-8">Nuestros servicios</h1>

  {#if loading}
    <div class="text-center py-20">Cargando servicios...</div>
  {:else if services.length === 0}
    <div class="text-center py-20 text-gray-500">No hay servicios disponibles.</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each services as service}
        <div class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
          <h3 class="text-xl font-bold text-gray-900 mb-2">{service.name}</h3>
          {#if service.description}
            <p class="text-gray-600 mb-4 line-clamp-3">{service.description}</p>
          {/if}
          {#if service.scope}
            <p class="text-sm text-gray-500 mb-4"><strong>Alcance:</strong> {service.scope}</p>
          {/if}
          <div class="mb-4">
            {#if service.price_type === 'fixed' && service.price !== null}
              <span class="text-energia-600 font-bold text-lg">${service.price.toLocaleString()} {service.currency || 'USD'}</span>
            {:else if service.price_type === 'quote'}
              <span class="text-gray-500 text-sm">Precio bajo consulta</span>
            {:else}
              <span class="text-green-600 text-sm font-medium">Servicio gratuito</span>
            {/if}
          </div>
          <button class="w-full bg-energia-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-energia-700 transition-colors">
            Solicitar visita o cita
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
