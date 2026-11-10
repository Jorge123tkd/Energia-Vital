<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiRequest, ADMIN_TOKEN_KEY } from './lib/api';
  import AdminContent from './components/AdminContent.svelte';
  import AdminCustomers from './components/AdminCustomers.svelte';
  import AdminStaff from './components/AdminStaff.svelte';
  import AdminNotifications from './components/AdminNotifications.svelte';
  import NotificationBell from './components/NotificationBell.svelte';
  let token = $state('');
  let staffRole = $state<'admin' | 'operator'>('admin');
  let ownId = $state('');
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let checking = $state(true);
  let error = $state('');
  let message = $state('');
  let tab = $state<'customers' | 'requests' | 'appointments' | 'products' | 'services' | 'gallery' | 'site' | 'staff' | 'notifications'>('requests');
  let customers: any[] = $state([]);
  let requests: any[] = $state([]);
  let appointments: any[] = $state([]);
  let products: any[] = $state([]);
  let services: any[] = $state([]);
  let categories: any[] = $state([]);


  onMount(() => { void restore(); });
  async function restore() {
    const saved = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) {
      try { const info = await api.adminMe(saved); staffRole = info.user.role; ownId = info.user.id; token = saved; await reload(saved); }
      catch { sessionStorage.removeItem(ADMIN_TOKEN_KEY); }
    }
    checking = false;
  }
  async function login(event: SubmitEvent) {
    event.preventDefault(); loading = true; error = '';
    try {
      const data = await api.adminLogin({ email, password });
      token = data.access_token;
      staffRole = data.user.role;
      ownId = data.user.id;
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
    if (staffRole === 'operator') {
      const [c, r, a] = await Promise.all([api.adminCustomers(t), api.adminRequests(t), api.adminAppointments(t)]);
      customers = c.customers ?? []; requests = r.requests ?? []; appointments = a.appointments ?? [];
      products = []; services = []; categories = [];
      return;
    }
    const [c, r, a, p, s, cat] = await Promise.all([
      api.adminCustomers(t), api.adminRequests(t), api.adminAppointments(t), api.getAdminProducts(t), api.getAdminServices(t), api.getAdminCategories(t),
    ]);
    customers = c.customers ?? []; requests = r.requests ?? []; appointments = a.appointments ?? [];
    products = p.products ?? []; services = s.services ?? []; categories = cat.categories ?? [];
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

</script>

<div class="w-full min-w-0 max-w-none mx-auto px-3 sm:px-5 xl:px-8 py-5 xl:py-7 min-h-screen bg-slate-50">
  <header class="flex flex-wrap items-center justify-between gap-3 mb-7 rounded-2xl bg-gradient-to-r from-slate-950 via-teal-950 to-teal-800 text-white p-6 sm:p-8 shadow-lg">
    <div><p class="uppercase text-xs font-semibold tracking-widest text-teal-200 mb-2">Centro de operaciones</p><h1 class="text-3xl sm:text-4xl font-bold">Administración de Bonaire</h1><p class="text-teal-100 mt-2">Gestiona el catálogo, los clientes y el contenido de tu sitio desde un solo lugar.</p></div>
    <div class="flex gap-3 items-center"><a class="rounded-xl border border-teal-300 px-4 py-2 hover:bg-white/10" href="/">Ver sitio público</a>{#if token}
      <NotificationBell staff {token} onAll={() => tab = 'notifications'} />
      <button class="rounded-xl bg-white text-slate-950 px-4 py-2" onclick={logout}>Cerrar sesión</button>
    {/if}</div>
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
    <section class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6" aria-label="Resumen de operaciones">
      {#each [{label:'Solicitudes',count:requests.length,id:'requests'}, {label:'Citas',count:appointments.length,id:'appointments'},
        {label:'Clientes',count:customers.length,id:'customers'}, {label:'Productos',count:products.length,id:'products'}] as item}
        <button class="rounded-2xl text-left bg-white border border-slate-200 shadow-sm p-4 hover:border-teal-500" onclick={() => tab = item.id as typeof tab}>
          <span class="block text-slate-500 text-xs uppercase tracking-wide">{item.label}</span>
          <span class="block text-3xl font-bold mt-2 text-slate-900">{item.count}</span>
        </button>
      {/each}
    </section>
    <nav class="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-200 pb-4" aria-label="Secciones de administración">
      {#each [
        { id: 'requests', title: 'Solicitudes' }, { id: 'appointments', title: 'Citas' },
        { id: 'customers', title: 'Clientes' },
        ...(staffRole === 'admin' ? [{ id: 'products', title: 'Productos' }] : []),
        ...(staffRole === 'admin' ? [
          { id: 'services', title: 'Servicios' }, { id: 'gallery', title: 'Galería' },
          { id: 'site', title: 'Mi sitio web' }, { id: 'staff', title: 'Personal y permisos' },
        ] : []),
        { id: 'notifications', title: 'Notificaciones' },
      ] as item}
        <button class="rounded-xl px-4 py-2.5 text-sm font-semibold transition {tab === item.id ? 'bg-teal-700 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-400'}"
          onclick={() => { tab = item.id as typeof tab; }}>{item.title}</button>
      {/each}
      <button title="Consultar nuevamente cambios que hayan realizado otras personas" class="ml-auto px-3 py-2.5 text-sm text-slate-500 hover:text-teal-700"
        onclick={() => { void reload().then(() => message = 'Datos sincronizados.').catch(e => error = String(e)); }}>↻ Sincronizar</button>
    </nav>
    {#if error}<p role="alert" class="text-red-700 mb-4">{error}</p>{/if}
    {#if message}<p role="status" class="text-green-700 mb-4">{message}</p>{/if}
    {#if tab === 'customers'}
      <AdminCustomers {token} {customers} canManage={staffRole === 'admin'} onRefresh={async () => { await reload(); }} />
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
    {:else if staffRole === 'admin' && (tab === 'products' || tab === 'services' || tab === 'gallery' || tab === 'site')}
      <AdminContent {token} {tab} {products} {services} {categories} onRefresh={async () => { await reload(); }} />
    {:else if staffRole === 'admin' && tab === 'staff'}
      <AdminStaff {token} {ownId} />
    {:else if tab === 'notifications'}
      <AdminNotifications {token} {customers} canSend={staffRole === 'admin'} />
    {/if}
  {/if}
</div>
