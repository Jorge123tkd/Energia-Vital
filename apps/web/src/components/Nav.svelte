<script lang="ts">
  import { isAssistantOpen } from '../lib/store';

  interface Props {
    navigate: (path: string) => void;
  }

  let { navigate }: Props = $props();

  let isMobileMenuOpen = $state(false);

  function toggleAssistant() {
    isAssistantOpen.update((v) => !v);
  }
  function toggleMobileMenu() {
    isMobileMenuOpen = !isMobileMenuOpen;
  }
</script>

<nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <a href="/" class="flex items-center gap-2" onclick={() => { navigate('/'); }} aria-label="Inicio Energía Vital">
        <div class="w-8 h-8 bg-energia-600 rounded flex items-center justify-center text-white font-bold">EV</div>
        <span class="font-bold text-xl text-gray-900 tracking-tight">Energía Vital</span>
      </a>

      <div class="hidden md:flex gap-6 items-center">
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/')}>Inicio</button>
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/catalogo')}>Catálogo</button>
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/servicios')}>Servicios</button>
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/asesor-solar')}>Asesor Solar</button>
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/galeria')}>Galería</button>
        <button class="text-gray-600 hover:text-energia-600 font-medium transition-colors" onclick={() => navigate('/contacto')}>Contacto</button>
        <button class="bg-energia-600 text-white px-4 py-2 rounded-md hover:bg-energia-700 transition-colors font-medium" onclick={toggleAssistant}>
          Asistente
        </button>
      </div>

      <div class="md:hidden flex items-center gap-2">
        <button class="text-gray-600 hover:text-energia-600" onclick={toggleAssistant}>
          <span class="sr-only">Asistente</span>
          💬
        </button>
        <!-- Botón de menú hamburguesa para móviles -->
        <button class="text-gray-600 hover:text-energia-600 p-2" onclick={toggleMobileMenu}>
          <span class="sr-only">Abrir menú</span>
          ☰
        </button>
      </div>
    </div>

    {#if isMobileMenuOpen}
      <div class="md:hidden">
        <div class="px-3 pt-2 pb-3 space-y-1">
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/')}>Inicio</button>
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/catalogo')}>Catálogo</button>
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/servicios')}>Servicios</button>
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/asesor-solar')}>Asesor Solar</button>
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/galeria')}>Galería</button>
          <button class="block w-full text-left text-gray-600 hover:text-energia-600 py-2" onclick={() => navigate('/contacto')}>Contacto</button>
        </div>
      </div>
    {/if}
  </div>
</nav>
