<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiRequest, ADMIN_TOKEN_KEY } from './lib/api';
  let token = $state('');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let checking = $state(true);
  let error = $state('');
  let message = $state('');
  let tab = $state<'customers' | 'requests' | 'appointments' | 'products' | 'services'>('requests');
  let customers: any[] = $state([]);
  let requests: any[] = $state([]);
  let appointments: any[] = $state([]);
  let products: any[] = $state([]);
  let services: any[] = $state([]);
  let categories: any[] = $state([]);
  let categoryName = $state('');
  let productCategoryId = $state('');
  let productName = $state('');
  let productPrice = $state<number | undefined>(undefined);
  let serviceName = $state('');

  onMount(() => { void restore(); });
  async function restore() {
    const saved = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      try { await api.adminMe(saved); token = saved; await reload(saved); }
      catch { sessionStorage.removeItem(ADMIN_TOKEN_KEY); }
    }
    checking = false;
  }
  async function login(event: SubmitEvent) {
    event.preventDefault(); loading = true; error = '';
    try {
      const data = await api.adminLogin({ email, password });
      token = data.access_token;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      password = '';
      await reload(token);
    } catch (e) { error = e instanceof Error ? e.message : 'Error al iniciar sesión'; }
    finally { loading = false; }
  }
  async function logout() {
    try { await apiRequest('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' }); } catch { /* Limpiar sesión local. */ }
    token = ''; sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    customers = []; requests = []; appointments = []; products = []; services = []; categories = [];
  }
  async function reload(t = token) {
    if (!t) return;
    const [c, r, a, p, s, cat] = await Promise.all([
      api.adminCustomers(t), api.adminRequests(t), api.adminAppointments(t), api.getAdminProducts(t), api.getAdminServices(t), api.getAdminCategories(t),
    ]);
    customers = c.customers ?? []; requests = r.requests ?? []; appointments = a.appointments ?? [];
    products = p.products ?? []; services = s.services ?? []; categories = cat.categories ?? [];
    if (!productCategoryId || !categories.some((c: any) => c.id === productCategoryId)) productCategoryId = categories[0]?.id || '';
  }
  async function changeRequest(id: string, status: string) {
    error = ''; message = '';
    try { await api.updateAdminRequest(token, id, status); await reload(); message = 'Solicitud actualizada.'; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo actualizar'; }
  }
  async function changeAppointment(id: string, status: string) {
    error = ''; message = '';
    try { await api.updateAdminAppointment(token, id, status); await reload(); message = 'Cita actualizada.'; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo actualizar'; }
  }
  const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function createProduct(event: SubmitEvent) {
    event.preventDefault(); error = '';
    try {
      if (!productCategoryId) throw new Error('Debes crear una categoría antes de añadir productos.');
      await api.createAdminProduct(token, { category_id: productCategoryId, name: productName, slug: `${slug(productName)}-${Date.now()}`, price: productPrice === undefined ? null : Number(productPrice), currency: 'USD', stock_status: 'on_order' });
      productName = ''; productPrice = undefined; await reload(); message = 'Producto registrado.';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo crear el producto'; }
  }
  async function createCategory(event: SubmitEvent) {
    event.preventDefault(); error = ''; message = '';
    try {
      if (!categoryName.trim()) return;
      await api.createAdminCategory(token, { name: categoryName.trim(), slug: `${slug(categoryName)}-${Date.now()}` });
      categoryName = ''; await reload(); message = 'Categoría creada.';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo crear la categoría'; }
  }
  async function createService(event: SubmitEvent) {
    event.preventDefault(); error = '';
    try {
      await api.createAdminService(token, { name: serviceName, slug: `${slug(serviceName)}-${Date.now()}`, price_type: 'quote' });
      serviceName = ''; await reload(); message = 'Servicio registrado.';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo crear el servicio'; }
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-screen">
  <header class="flex flex-wrap items-center justify-between gap-3 mb-7">
    <div><h1 class="text-3xl font-bold">Administración de Energía Vital</h1><p class="text-gray-600">Panel privado de operaciones y clientes</p></div>
    <div class="flex gap-3"><a class="underline text-energia-700" href="/">Ir al sitio</a>{#if token}<button class="text-red-700 underline" onclick={logout}>Cerrar sesión</button>{/if}</div>
  </header>
  {#if checking}
    <p>Verificando acceso…</p>
  {:else if !token}
    <form onsubmit={login} class="max-w-md bg-white border rounded-xl p-6 space-y-4">
      <h2 class="text-xl font-semibold">Acceso de administrador</h2>
      <label class="block">Correo<input required type="email" autocomplete="username" bind:value={email} class="block border rounded-lg p-3 mt-1 w-full" /></label>
      <label class="block">Contraseña<input required type="password" autocomplete="current-password" bind:value={password} class="block border rounded-lg p-3 mt-1 w-full" /></label>
      {#if error}<p role="alert" class="text-red-700">{error}</p>{/if}
      <button disabled={loading} class="bg-energia-600 text-white py-3 px-5 rounded-lg">{loading ? 'Entrando…' : 'Iniciar sesión'}</button>
    </form>
  {:else}
    <nav class="flex flex-wrap gap-2 mb-6" aria-label="Panel">
      {#each [
        { id: 'requests', title: 'Solicitudes' }, { id: 'appointments', title: 'Citas' }, { id: 'customers', title: 'Clientes' },
        { id: 'products', title: 'Productos' }, { id: 'services', title: 'Servicios' },
      ] as item}
        <button class="px-4 py-2 rounded-lg border {tab === item.id ? 'bg-energia-600 text-white' : 'bg-white'}" onclick={() => { tab = item.id as typeof tab; }}>{item.title}</button>
      {/each}
      <button class="px-4 py-2 border rounded-lg" onclick={() => { void reload().catch(e => error = String(e)); }}>Actualizar</button>
    </nav>
    {#if error}<p role="alert" class="text-red-700 mb-4">{error}</p>{/if}
    {#if message}<p role="status" class="text-green-700 mb-4">{message}</p>{/if}
    {#if tab === 'customers'}
      <h2 class="font-semibold text-xl mb-4">Clientes registrados ({customers.length})</h2>
      <div class="space-y-3">{#each customers as c (c.id)}
        <article class="bg-white border rounded-lg p-4"><strong>{c.name}</strong><p>{c.email ?? 'Sin correo'} · {c.phone ?? 'Sin teléfono'}</p><p class="text-gray-600">{[c.address, c.city, c.province].filter(Boolean).join(', ')}</p></article>
      {/each}</div>
    {:else if tab === 'requests'}
      <h2 class="font-semibold text-xl mb-4">Solicitudes ({requests.length})</h2>
      <div class="space-y-3">{#each requests as r (r.id)}
        <article class="bg-white border rounded-lg p-4 space-y-2"><div class="flex flex-wrap justify-between gap-3"><strong>{r.title}</strong><select aria-label="Estado de la solicitud" value={r.status} onchange={e => void changeRequest(r.id, e.currentTarget.value)} class="border rounded p-2">
          {#each ['pending', 'quoted', 'approved', 'scheduled', 'completed', 'cancelled'] as status}<option value={status}>{status}</option>{/each}
        </select></div><p class="text-sm">{r.customer_name} · {r.phone} · {r.email}</p><p class="text-sm text-gray-600">{r.location}</p><p>{r.description}</p></article>
      {/each}</div>
    {:else if tab === 'appointments'}
      <h2 class="font-semibold text-xl mb-4">Citas ({appointments.length})</h2>
      <div class="space-y-3">{#each appointments as a (a.id)}
        <article class="bg-white border rounded-lg p-4 flex flex-wrap justify-between gap-3"><div><strong>{a.title}</strong><p>{a.customer_name} · {a.phone}</p><p>{new Date(a.starts_at).toLocaleString('es-CU')}</p></div><select aria-label="Estado de cita" value={a.status} onchange={e => void changeAppointment(a.id, e.currentTarget.value)} class="border rounded p-2 h-fit">
          {#each ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as status}<option value={status}>{status}</option>{/each}
        </select></article>
      {/each}</div>
    {:else if tab === 'products'}
      <h2 class="font-semibold text-xl mb-4">Productos ({products.length})</h2>
      <form onsubmit={createCategory} class="flex flex-wrap gap-2 mb-4"><input required placeholder="Nueva categoría (ej. Paneles solares)" bind:value={categoryName} class="border p-2 rounded flex-1" /><button class="bg-gray-800 text-white px-4 py-2 rounded">Crear categoría</button></form>
      <form onsubmit={createProduct} class="flex flex-wrap gap-2 mb-5"><select required bind:value={productCategoryId} class="border p-2 rounded"><option value="" disabled>Seleccionar categoría</option>{#each categories as cat (cat.id)}<option value={cat.id}>{cat.name}</option>{/each}</select><input required placeholder="Nombre del equipo" bind:value={productName} class="border p-2 rounded" /><input type="number" min="0" step="0.01" placeholder="Precio (opcional)" bind:value={productPrice} class="border p-2 rounded" /><button class="bg-energia-600 text-white px-4 rounded">Añadir</button></form>
      <div class="space-y-2">{#each products as p (p.id)}<div class="bg-white border rounded p-3 flex justify-between"><span>{p.name}</span><span>{p.price ?? 'A consultar'} {p.currency ?? ''}</span></div>{/each}</div>
    {:else if tab === 'services'}
      <h2 class="font-semibold text-xl mb-4">Servicios ({services.length})</h2>
      <form onsubmit={createService} class="flex gap-2 mb-5"><input required placeholder="Nombre del servicio" bind:value={serviceName} class="border p-2 rounded" /><button class="bg-energia-600 text-white px-4 rounded">Añadir</button></form>
      <div class="space-y-2">{#each services as s (s.id)}<div class="bg-white border rounded p-3">{s.name} · {s.price_type}</div>{/each}</div>
    {/if}
  {/if}
</div>
