<script lang="ts">
  import NotificationBell from './NotificationBell.svelte';
  import { ADMIN_TOKEN_KEY } from '../lib/api';
  let { navigate, customerName = '', userRole = 'customer', onLogout, onAssistant }: {
    navigate: (path: string) => void;
    customerName?: string;
    userRole?: string;
    onLogout: () => void;
    onAssistant: () => void;
  } = $props();
  let mobileOpen = $state(false);
  let profileMenu: HTMLDetailsElement | undefined = $state();
  const publicPages = [
    { path: '/', label: 'Inicio' },
    { path: '/catalogo', label: 'Catálogo' },
    { path: '/servicios', label: 'Servicios' },
    { path: '/galeria', label: 'Galería' },
    { path: '/asesor-solar', label: 'Asesor solar' },
    { path: '/contacto', label: 'Solicitar servicio' },
  ];
  function visit(path: string) {
    if (profileMenu) profileMenu.open = false;
    mobileOpen = false;
    navigate(path);
  }
  function assistant() {
    if (profileMenu) profileMenu.open = false;
    mobileOpen = false;
    onAssistant();
  }
  function logout() {
    if (profileMenu) profileMenu.open = false;
    mobileOpen = false;
    onLogout();
  }
</script>

<svelte:window
  onclick={(e) => { if (profileMenu && !profileMenu.contains(e.target as Node)) profileMenu.open = false; }}
  onkeydown={(e) => { if (e.key === 'Escape' && profileMenu) profileMenu.open = false; }}
/>

<header class="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-50">
  <nav aria-label="Navegación principal" class="w-full max-w-[1600px] mx-auto flex items-center justify-between px-4 sm:px-6 xl:px-8 py-3 gap-3">
    <button type="button" class="flex items-center gap-2 font-extrabold text-lg sm:text-xl text-slate-900 shrink-0" onclick={() => visit('/')} aria-label="Inicio Bonaire">
      <span class="w-10 h-10 rounded-xl bg-teal-700 text-white font-black flex items-center justify-center shadow-sm">B</span>
      <span>Bonaire</span>
    </button>
    <div class="hidden lg:flex gap-1 xl:gap-2 items-center min-w-0">
      {#each publicPages as page}
        <button type="button" class="text-slate-700 hover:text-teal-700 hover:bg-teal-50 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap" onclick={() => visit(page.path)}>{page.label}</button>
      {/each}
      <button type="button" class="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap" onclick={assistant}>Asistente</button>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      {#if customerName}
        <NotificationBell staff={userRole === 'admin' || userRole === 'operator'} token={(userRole === 'admin' || userRole === 'operator') ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || '' : ''} onAll={() => visit('/notificaciones')} />
        <details bind:this={profileMenu} class="relative group">
          <summary class="list-none cursor-pointer select-none flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 focus-visible:outline-2 focus-visible:outline-teal-600" aria-label="Abrir menú de usuario">
            <span class="inline-flex w-7 h-7 items-center justify-center rounded-full bg-teal-50 font-bold text-teal-800">{customerName.trim().charAt(0).toUpperCase() || 'U'}</span>
            <span class="hidden sm:inline max-w-32 xl:max-w-44 truncate text-sm font-semibold text-slate-800">{customerName}</span>
            <span aria-hidden="true" class="text-xs text-slate-500 transition group-open:rotate-180">▾</span>
          </summary>
          <div class="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl p-2 shadow-xl z-[70]">
            <p class="px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-slate-400">{userRole === 'admin' ? 'Cuenta administradora' : userRole === 'operator' ? 'Cuenta moderadora' : 'Mi cuenta'}</p>
            <button type="button" onclick={() => visit('/perfil')} class="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Mi perfil</button>
            {#if userRole === 'admin' || userRole === 'operator'}
              <a href="/admin" class="block rounded-lg px-3 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-50">Administración</a>
            {:else}
              <button type="button" onclick={() => visit('/mis-solicitudes')} class="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Mis solicitudes</button>
            {/if}
            {#if userRole !== 'admin' && userRole !== 'operator'}
              <button type="button" onclick={() => visit('/asistente')} class="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-teal-800 hover:bg-teal-50">Asistente e historial</button>
            {/if}
            <button type="button" onclick={() => visit('/notificaciones')} class="w-full text-left rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Notificaciones</button>
            <div class="border-t border-slate-100 my-1"></div>
            <button type="button" onclick={logout} class="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Cerrar sesión</button>
          </div>
        </details>
      {:else}
        <button type="button" class="text-sm font-semibold text-teal-800 border border-teal-200 rounded-xl px-3 py-2.5" onclick={() => visit('/entrar')}>Entrar</button>
        <button type="button" class="hidden sm:inline-block text-sm font-semibold bg-teal-700 text-white rounded-xl px-3 py-2.5" onclick={() => visit('/registro')}>Crear cuenta</button>
      {/if}
      <button type="button" class="lg:hidden border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800" aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileOpen} onclick={() => mobileOpen = !mobileOpen}>☰</button>
    </div>
  </nav>
  {#if mobileOpen}
    <nav aria-label="Menú móvil" class="lg:hidden bg-white border-t border-slate-100 px-4 sm:px-6 pb-4 pt-2 grid grid-cols-2 gap-1">
      {#each publicPages as page}
        <button type="button" class="text-left px-3 py-2.5 text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50" onclick={() => visit(page.path)}>{page.label}</button>
      {/each}
      <button type="button" class="text-left px-3 py-2.5 text-sm font-bold text-teal-700 rounded-lg" onclick={assistant}>Abrir asistente</button>
      {#if !customerName}
        <button type="button" class="text-left px-3 py-2.5 text-sm font-medium text-teal-700 rounded-lg" onclick={() => visit('/registro')}>Crear cuenta</button>
      {/if}
    </nav>
  {/if}
</header>
