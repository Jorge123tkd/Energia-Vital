<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { isAuthenticated, authToken, adminUser, addNotification } from './lib/store';

  let email = $state('');
  let password = $state('');
  let loggingIn = $state(false);
  let showAdmin = $state(false);
  let activeTab = $state('dashboard');

  let products: any[] = $state([]);
  let services: any[] = $state([]);
  let gallery: any[] = $state([]);
  let categories: any[] = $state([]);
  let faqs: any[] = $state([]);
  let configItems: any[] = $state([]);

  function setTab(tab) {
    activeTab = tab;
  }
</script>
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  {#if !showAdmin}
    <div class="bg-white border border-gray-200 rounded-xl p-8 md:p-12 shadow-sm max-w-md mx-auto">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Panel de Administración</h1>
      <form onsubmit={login} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
          <input type="email" bind:value={email} required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
          <input type="password" bind:value={password} required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <button type="submit" class="w-full bg-energia-600 text-white py-3 rounded-lg font-medium hover:bg-energia-700 transition-colors" disabled={loggingIn}>
          {loggingIn ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>
      <p class="mt-6 text-center text-sm text-gray-500">
        ¿Primera vez? Usa <code>/api/auth/setup</code> para crear el primer administrador.
      </p>
    </div>
  {:else}
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <div class="flex gap-2">
        <span class="text-sm text-gray-600">{$adminUser?.email}</span>
        <button class="text-gray-600 hover:text-red-600 text-sm" onclick={logout}>Cerrar sesión</button>
      </div>
    </div>
<div class="flex gap-4 border-b border-gray-200 mb-6">
      <button class="px-4 py-2 font-medium {activeTab === 'dashboard' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('dashboard')}>Dashboard</button>
      <button class="px-4 py-2 font-medium {activeTab === 'products' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('products')}>Productos</button>
      <button class="px-4 py-2 font-medium {activeTab === 'services' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('services')}>Servicios</button>
      <button class="px-4 py-2 font-medium {activeTab === 'categories' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('categories')}>Categorías</button>
      <button class="px-4 py-2 font-medium {activeTab === 'faq' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('faq')}>FAQ</button>
      <button class="px-4 py-2 font-medium {activeTab === 'gallery' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('gallery')}>Galería</button>
      <button class="px-4 py-2 font-medium {activeTab === 'config' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('config')}>Configuración</button>
    </div>

    {#if activeTab === 'dashboard'}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Productos</p>
          <p class="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Servicios</p>
          <p class="text-2xl font-bold text-gray-900">{services.length}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Galería</p>
          <p class="text-2xl font-bold text-gray-900">{gallery.length}</p>
        </div>
      </div>
    {:else if activeTab === 'products'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Productos</h2>
        <p class="text-gray-500">Productos tab content</p>
      </div>
    {:else if activeTab === 'services'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Servicios</h2>
        <p class="text-gray-500">Servicios tab content</p>
      </div>
    {:else if activeTab === 'categories'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Categorías</h2>
        <p class="text-gray-500">Categorías tab content</p>
      </div>
    {:else if activeTab === 'faq'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Preguntas Frecuentes</h2>
        <p class="text-gray-500">FAQ tab content</p>
      </div>
    {:else if activeTab === 'gallery'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Galería</h2>
        <p class="text-gray-500">Galería tab content</p>
      </div>
    {:else if activeTab === 'config'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Configuración</h2>
        <p class="text-gray-500">Configuración tab content</p>
      </div>
    {/if}<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { isAuthenticated, authToken, adminUser, addNotification } from './lib/store';

  let email = $state('');
  let password = $state('');
  let loggingIn = $state(false);
  let showAdmin = $state(false);
  let activeTab = $state('dashboard');

  let products: any[] = $state([]);
  let services: any[] = $state([]);
  let gallery: any[] = $state([]);
  let categories: any[] = $state([]);
  let faqs: any[] = $state([]);
  let configItems: any[] = $state([]);

  function setTab(tab: string) {
    activeTab = tab;
  }

  async function login(e: Event) {
    e.preventDefault();
    loggingIn = true;
    try {
      // TODO: Reemplaza esto con tu llamada real a la API de login
      // const res = await api.post('/auth/login', { email, password });
      console.log("Intentando login con:", email, password);
      
      // Simulación de éxito para que puedas ver la UI del dashboard
      showAdmin = true; 
    } catch (err) {
      addNotification("Error al iniciar sesión", "error");
    } finally {
      loggingIn = false;
    }
  }

  function logout() {
    showAdmin = false;
    email = '';
    password = '';
    // TODO: Agrega aquí la lógica para limpiar el token o store si es necesario
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  {#if !showAdmin}
    <div class="bg-white border border-gray-200 rounded-xl p-8 md:p-12 shadow-sm max-w-md mx-auto">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Panel de Administración</h1>
      <form onsubmit={login} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
          <input type="email" bind:value={email} required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
          <input type="password" bind:value={password} required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
        <button type="submit" class="w-full bg-energia-600 text-white py-3 rounded-lg font-medium hover:bg-energia-700 transition-colors" disabled={loggingIn}>
          {loggingIn ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>
      <p class="mt-6 text-center text-sm text-gray-500">
        ¿Primera vez? Usa <code>/api/auth/setup</code> para crear el primer administrador.
      </p>
    </div>
  {:else}
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
      <div class="flex gap-2">
        <span class="text-sm text-gray-600">{$adminUser?.email || 'Admin'}</span>
        <button class="text-gray-600 hover:text-red-600 text-sm" onclick={logout}>Cerrar sesión</button>
      </div>
    </div>

    <div class="flex gap-4 border-b border-gray-200 mb-6 overflow-x-auto">
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'dashboard' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('dashboard')}>Dashboard</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'products' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('products')}>Productos</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'services' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('services')}>Servicios</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'categories' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('categories')}>Categorías</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'faq' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('faq')}>FAQ</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'gallery' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('gallery')}>Galería</button>
      <button class="px-4 py-2 font-medium whitespace-nowrap {activeTab === 'config' ? 'text-energia-600 border-b-2 border-energia-600' : 'text-gray-600 hover:text-gray-900'}" onclick={() => setTab('config')}>Configuración</button>
    </div>

    {#if activeTab === 'dashboard'}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Productos</p>
          <p class="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Servicios</p>
          <p class="text-2xl font-bold text-gray-900">{services.length}</p>
        </div>
        <div class="bg-white border border-gray-200 rounded-xl p-6">
          <p class="text-sm text-gray-500 uppercase">Galería</p>
          <p class="text-2xl font-bold text-gray-900">{gallery.length}</p>
        </div>
      </div>
    {:else if activeTab === 'products'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Productos</h2>
        <p class="text-gray-500">Productos tab content</p>
      </div>
    {:else if activeTab === 'services'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Servicios</h2>
        <p class="text-gray-500">Servicios tab content</p>
      </div>
    {:else if activeTab === 'categories'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Categorías</h2>
        <p class="text-gray-500">Categorías tab content</p>
      </div>
    {:else if activeTab === 'faq'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Preguntas Frecuentes</h2>
        <p class="text-gray-500">FAQ tab content</p>
      </div>
    {:else if activeTab === 'gallery'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Galería</h2>
        <p class="text-gray-500">Galería tab content</p>
      </div>
    {:else if activeTab === 'config'}
      <div class="pb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Configuración</h2>
        <p class="text-gray-500">Configuración tab content</p>
      </div>
    {/if}
  {/if} <!-- ✅ Cierre del {#if !showAdmin} -->
</div> <!-- ✅ Cierre del div principal -->