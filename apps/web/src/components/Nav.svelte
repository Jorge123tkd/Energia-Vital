<script lang="ts">
  let { navigate, customerName = '', onLogout, onAssistant }: {
    navigate: (path: string) => void;
    customerName?: string;
    onLogout: () => void;
    onAssistant: () => void;
  } = $props();
  let mobileOpen = $state(false);
  const publicPages = [
    { path: '/', label: 'Inicio' },
    { path: '/catalogo', label: 'Catálogo' },
    { path: '/servicios', label: 'Servicios' },
    { path: '/galeria', label: 'Galería' },
  ];
  const customerPages = [
    { path: '/asesor-solar', label: 'Asesor solar' },
    { path: '/contacto', label: 'Solicitar servicio' },
    { path: '/mis-solicitudes', label: 'Mis solicitudes' },
    { path: '/perfil', label: 'Mi perfil' },
  ];
  function visit(path: string) { navigate(path); mobileOpen = false; }
  function assistant() { onAssistant(); mobileOpen = false; }
</script>

<header class="bg-white border-b border-gray-200 sticky top-0 z-50">
  <nav aria-label="Navegación principal" class="max-w-7xl mx-auto flex flex-wrap items-center justify-between px-4 py-3 gap-3">
    <button class="flex items-center gap-2 font-bold text-lg" onclick={() => visit('/')} aria-label="Inicio Energía Vital">
      <span class="bg-energia-600 text-white rounded p-2">EV</span> Energía Vital
    </button>
    <div class="hidden lg:flex gap-3 items-center flex-wrap">
      {#each publicPages as page}<button class="text-gray-700 hover:text-energia-600 text-sm" onclick={() => visit(page.path)}>{page.label}</button>{/each}
      {#each customerPages as page}<button class="text-gray-700 hover:text-energia-600 text-sm" onclick={() => visit(page.path)}>{page.label}</button>{/each}
      <button class="bg-energia-600 text-white px-3 py-2 rounded" onclick={assistant}>Asistente</button>
    </div>
    <div class="flex items-center gap-2">
      {#if customerName}
        <span class="hidden sm:block text-xs text-gray-600 truncate max-w-36" title={customerName}>{customerName}</span>
        <button class="text-sm text-red-700 border rounded px-2 py-1" onclick={onLogout}>Salir</button>
      {:else}
        <button class="text-sm text-energia-700 border rounded px-3 py-2" onclick={() => visit('/entrar')}>Entrar</button>
        <button class="text-sm bg-energia-600 text-white rounded px-3 py-2" onclick={() => visit('/registro')}>Crear cuenta</button>
      {/if}
      <button class="lg:hidden border rounded px-2 py-1" aria-label="Menú" aria-expanded={mobileOpen} onclick={() => mobileOpen = !mobileOpen}>☰</button>
    </div>
  </nav>
  {#if mobileOpen}
    <nav aria-label="Menú móvil" class="lg:hidden bg-white px-4 pb-4 grid grid-cols-2 gap-2">
      {#each [...publicPages, ...customerPages] as page}<button class="text-left py-2 text-gray-700" onclick={() => visit(page.path)}>{page.label}</button>{/each}
      <button class="text-left py-2 text-energia-700" onclick={assistant}>Abrir asistente</button>
    </nav>
  {/if}
</header>
