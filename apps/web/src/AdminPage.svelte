<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { isAuthenticated, authToken, adminUser, addNotification } from './lib/store';

  let email = '';
  let password = '';
  let loggingIn = false;
  let showAdmin = false;
  let products: any[] = [];

  async function login() {
    loggingIn = true;
    try {
      const res = await api.login({ email, password });
      authToken.set(res.token);
      adminUser.set(res.user);
      isAuthenticated.set(true);
      showAdmin = true;
      addNotification('success', 'Sesión iniciada correctamente');
    } catch (e: any) {
      addNotification('error', e.message || 'Error al iniciar sesión');
    } finally {
      loggingIn = false;
    }
  }

  async function loadProducts() {
    try {
      const token = await new Promise<string | null>((resolve) => authToken.subscribe((v) => resolve(v))());
      if (!token) return;
      const res = await api.getAdminProducts(token);
      products = res.products ?? [];
    } catch (e) {
      console.error(e);
    }
  }

  onMount(async () => {
    let authenticated = false;
    isAuthenticated.subscribe((v) => { authenticated = v; })();
    if (authenticated) showAdmin = true;
  });
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  {#if !showAdmin}
    <div class="bg-white border border-gray-200 rounded-xl p-8 md:p-12 shadow-sm max-w-md mx-auto">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Panel de Administración</h1>
      <form on:submit|preventDefault={login} class="space-y-4">
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
        <button class="text-gray-600 hover:text-red-600 text-sm">Cerrar sesión</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <p class="text-sm text-gray-500 uppercase">Productos</p>
        <p class="text-2xl font-bold text-gray-900">{products.length}</p>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <p class="text-sm text-gray-500 uppercase">Solicitudes pendientes</p>
        <p class="text-2xl font-bold text-gray-900">0</p>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <p class="text-sm text-gray-500 uppercase">Citas hoy</p>
        <p class="text-2xl font-bold text-gray-900">0</p>
      </div>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-bold text-gray-900">Gestión de productos</h2>
      </div>
      <div class="p-6">
        <button class="bg-energia-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-energia-700 transition-colors mb-4">Agregar producto</button>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-sm font-medium text-gray-600">Nombre</th>
                <th class="px-4 py-2 text-sm font-medium text-gray-600">Marca</th>
                <th class="px-4 py-2 text-sm font-medium text-gray-600">Precio</th>
                <th class="px-4 py-2 text-sm font-medium text-gray-600">Estado</th>
                <th class="px-4 py-2 text-sm font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {#each products as product}
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                  <td class="px-4 py-3 text-gray-900 font-medium">{product.name}</td>
                  <td class="px-4 py-3 text-gray-600">{product.brand || '-'} {product.model || ''}</td>
                  <td class="px-4 py-3 text-gray-900">${product.price?.toLocaleString() || '-'} {product.currency}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-medium" class:bg-green-100 class:text-green-700={product.is_active} class:bg-red-100 class:text-red-700={!product.is_active}>
                      {product.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <button class="text-energia-600 text-sm hover:underline">Editar</button>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-gray-500">No hay productos registrados.</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>