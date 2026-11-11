<script lang="ts">
  import { onMount } from 'svelte';
  import { api, apiRequest, ADMIN_TOKEN_KEY } from './lib/api';
  import AdminContent from './components/AdminContent.svelte';
  import AdminCustomers from './components/AdminCustomers.svelte';
  import AdminStaff from './components/AdminStaff.svelte';
  import AdminNotifications from './components/AdminNotifications.svelte';
  import NotificationBell from './components/NotificationBell.svelte';
  import AdminRequestCategories from './components/AdminRequestCategories.svelte';
  import RequestPhotoGallery from './components/RequestPhotoGallery.svelte';
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
  let mobileMenu = $state(false);
  let accountMenu = $state(false);
  let syncBusy = $state(false);
  let requestPhotosOpen = $state('');
  let requestQuery = $state('');
  let appointmentQuery = $state('');
  let requestPage = $state(1);
  let appointmentPage = $state(1);
  let requestTotal = $state(0);
  let appointmentTotal = $state(0);
  let pagingBusy = $state(false);
  let copiedReference = $state('');
  const pageSize = 20;
  async function copyReference(id: string) {
    try { await navigator.clipboard.writeText(id); copiedReference = id; }
    catch { error = 'No se pudo copiar el ID. Selecciónalo manualmente.'; }
  }
  async function loadRequestPage(page = 1) {
    pagingBusy = true;error = '';
    try {
      const data = await api.adminRequests(token, requestQuery, page, pageSize);
      requests = data.requests ?? []; requestTotal = data.total ?? requests.length; requestPage = page;
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudieron buscar las solicitudes.'; }
    finally { pagingBusy = false; }
  }
  async function loadAppointmentPage(page = 1) {
    pagingBusy = true;error = '';
    try {
      const data = await api.adminAppointments(token, appointmentQuery, page, pageSize);
      appointments = data.appointments ?? []; appointmentTotal = data.total ?? appointments.length; appointmentPage = page;
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudieron buscar las citas.'; }
    finally { pagingBusy = false; }
  }
  function searchRequest(event: SubmitEvent) { event.preventDefault(); void loadRequestPage(1); }
  function searchAppointment(event: SubmitEvent) { event.preventDefault(); void loadAppointmentPage(1); }
  let menuItems = $derived([
    { id: 'requests', title: 'Solicitudes' },
    { id: 'appointments', title: 'Citas' },
    { id: 'customers', title: 'Clientes' },
    ...(staffRole === 'admin' ? [
      { id: 'products', title: 'Productos' },
      { id: 'services', title: 'Servicios' },
      { id: 'gallery', title: 'Galería' },
      { id: 'site', title: 'Mi sitio web' },
      { id: 'staff', title: 'Personal y permisos' },
    ] : []),
    { id: 'notifications', title: 'Notificaciones' }
  ]);
  function chooseTab(next: typeof tab) {
    tab = next;
    if (token && next === 'requests') void loadRequestPage(1);
    if (token && next === 'appointments') void loadAppointmentPage(1);
    mobileMenu = false;
    accountMenu = false;
  }
  async function syncNow() {
    syncBusy = true;
    error = ''; message = '';
    try { await reload(); message = 'Datos sincronizados correctamente.'; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudieron sincronizar los datos.'; }
    finally { syncBusy = false; mobileMenu = false; accountMenu = false; }
  }
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
    mobileMenu = false; accountMenu = false;
    customers = []; requests = []; appointments = []; products = []; services = []; categories = [];
  }
  async function reload(t = token) {
    if (!t) return;
    if (staffRole === 'operator') {
      const [c, r, a] = await Promise.all([api.adminCustomers(t), api.adminRequests(t), api.adminAppointments(t)]);
      customers = c.customers ?? []; requests = r.requests ?? []; appointments = a.appointments ?? [];
      requestTotal = requests.length; appointmentTotal = appointments.length;
      products = []; services = []; categories = [];
      return;
    }
    const [c, r, a, p, s, cat] = await Promise.all([
      api.adminCustomers(t), api.adminRequests(t), api.adminAppointments(t), api.getAdminProducts(t), api.getAdminServices(t), api.getAdminCategories(t),
    ]);
    customers = c.customers ?? []; requests = r.requests ?? []; appointments = a.appointments ?? [];
    requestTotal = requests.length; appointmentTotal = appointments.length;
    products = p.products ?? []; services = s.services ?? []; categories = cat.categories ?? [];
  }
  async function changeRequest(id: string, status: string) {
    error = ''; message = '';
    try { await api.updateAdminRequest(token, id, status); await loadRequestPage(requestPage); message = 'Solicitud actualizada.'; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo actualizar'; }
  }
  async function changeAppointment(id: string, status: string) {
    error = ''; message = '';
    try { await api.updateAdminAppointment(token, id, status); await loadAppointmentPage(appointmentPage); message = 'Cita actualizada.'; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo actualizar'; }
  }

</script>

<div class="w-full min-w-0 max-w-none mx-auto px-3 sm:px-5 xl:px-8 py-5 xl:py-7 min-h-screen bg-slate-50">
  <header class="sticky top-0 z-[90] -mx-3 sm:-mx-5 xl:-mx-8 -mt-5 xl:-mt-7 mb-6 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
    <div class="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-5 xl:px-8 py-2.5 min-w-0">
      <button type="button" class="flex items-center gap-2.5 shrink-0 rounded-xl hover:bg-slate-50 pr-2" aria-label="Panel principal de Bonaire"
        onclick={() => chooseTab('requests')}>
        <span class="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-black text-xl">B</span>
        <span class="text-left leading-tight">
          <span class="block text-base sm:text-lg font-extrabold text-slate-900">Bonaire</span>
          <span class="block text-[10px] uppercase font-bold tracking-wider text-teal-700">Administración</span>
        </span>
      </button>

      {#if token}
        <nav aria-label="Secciones del panel" class="hidden xl:flex flex-1 min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap py-1">
          {#each menuItems as item (item.id)}
            <button type="button" onclick={() => chooseTab(item.id as typeof tab)}
              aria-current={tab === item.id ? 'page' : undefined}
              class="shrink-0 rounded-lg px-2.5 py-2 text-xs 2xl:text-sm font-semibold transition-colors {tab === item.id ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-teal-50 hover:text-teal-900'}">{item.title}</button>
          {/each}
        </nav>
      {:else}
        <span class="flex-1"></span>
      {/if}

      <div class="flex items-center justify-end gap-2 ml-auto shrink-0">
        {#if token}
          <NotificationBell staff {token} onAll={() => chooseTab('notifications')} />
          <div class="hidden xl:block relative">
            <button type="button" class="flex items-center gap-2 rounded-xl border border-slate-200 text-slate-700 px-3 py-2.5 text-sm font-bold bg-white hover:bg-slate-50"
              aria-label="Abrir menú de mi cuenta" aria-expanded={accountMenu} onclick={() => accountMenu = !accountMenu}>
              <span class="w-6 h-6 rounded-full bg-teal-50 text-teal-800 flex items-center justify-center text-xs font-extrabold">{staffRole === 'admin' ? 'A' : 'M'}</span>
              Mi cuenta <span aria-hidden="true">▾</span>
            </button>
            {#if accountMenu}
              <div class="absolute right-0 top-full mt-2 bg-white w-60 border border-slate-200 rounded-2xl p-2 shadow-xl z-[110]">
                <p class="text-xs px-3 py-2 font-bold text-slate-400">{staffRole === 'admin' ? 'Administrador' : 'Moderador'}</p>
                <a href="/perfil" class="block px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Mi perfil</a>
                <a href="/" class="block px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Ver sitio público</a>
                <button type="button" disabled={syncBusy} onclick={syncNow} class="block w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">{syncBusy ? 'Sincronizando…' : '↻ Sincronizar datos'}</button>
                <div class="border-t border-slate-100 my-1"></div>
                <button type="button" onclick={logout} class="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-50">Cerrar sesión</button>
              </div>
            {/if}
          </div>
          <button type="button" aria-label={mobileMenu ? 'Cerrar menú de administración' : 'Abrir menú de administración'} aria-expanded={mobileMenu}
            aria-controls="admin-mobile-menu" onclick={() => { mobileMenu = !mobileMenu; accountMenu = false; }}
            class="xl:hidden flex items-center justify-center w-11 h-11 rounded-xl border border-slate-200 text-slate-800 bg-white hover:bg-slate-50 text-xl font-bold">
            {mobileMenu ? '✕' : '☰'}
          </button>
        {:else}
          <a href="/" class="text-xs sm:text-sm font-semibold text-teal-800 rounded-lg border border-teal-200 px-3 py-2.5 hover:bg-teal-50">Ver sitio público</a>
        {/if}
      </div>
    </div>
    {#if token && mobileMenu}
      <nav id="admin-mobile-menu" aria-label="Menú móvil de administración" class="xl:hidden border-t border-slate-200 bg-white px-3 sm:px-5 py-3 shadow-md max-h-[75vh] overflow-y-auto">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {#each menuItems as item (item.id)}
            <button type="button" onclick={() => chooseTab(item.id as typeof tab)}
              aria-current={tab === item.id ? 'page' : undefined}
              class="text-left rounded-xl px-3 py-3 text-sm font-semibold {tab === item.id ? 'bg-teal-700 text-white' : 'bg-slate-50 text-slate-700 hover:bg-teal-50'}">{item.title}</button>
          {/each}
        </div>
        <div class="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <a href="/perfil" class="rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 text-center">Mi perfil</a>
          <a href="/" class="rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 text-center">Ver sitio público</a>
          <button type="button" disabled={syncBusy} onclick={syncNow} class="rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700">{syncBusy ? 'Actualizando…' : '↻ Sincronizar'}</button>
          <button type="button" onclick={logout} class="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-sm font-semibold text-red-700">Cerrar sesión</button>
        </div>
      </nav>
    {/if}
  </header>
  {#if checking}
    <p>Verificando acceso…</p>
  {:else if !token}
    <form onsubmit={login} class="max-w-lg mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-9 space-y-5 shadow-xl shadow-slate-200/50">
      <span class="inline-flex items-center justify-center bg-teal-700 text-white rounded-xl w-12 h-12 font-black text-xl">B</span>
      <div><h2 class="text-2xl font-extrabold text-slate-900">Acceso al equipo Bonaire</h2>
        <p class="text-sm text-slate-500 mt-2">Administradores y moderadores pueden entrar con las credenciales asignadas.</p></div>
      <label class="block text-sm font-semibold text-slate-700">Correo electrónico
        <input required type="email" autocomplete="username" bind:value={email} class="block border border-slate-300 rounded-xl px-4 py-3 mt-2 w-full focus:outline-teal-600" />
      </label>
      <label class="block text-sm font-semibold text-slate-700">Contraseña
        <input required type="password" autocomplete="current-password" bind:value={password} class="block border border-slate-300 rounded-xl px-4 py-3 mt-2 w-full focus:outline-teal-600" />
      </label>
      {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>{/if}
      <button disabled={loading} class="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white py-3.5 px-5 rounded-xl font-bold">{loading ? 'Entrando…' : 'Entrar en administración'}</button>
    </form>
  {:else}
    <div class="mb-5 flex items-center gap-3 justify-between">
      <div>
        <p class="text-xs font-extrabold uppercase tracking-wider text-teal-700">Centro de operaciones</p>
        <h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">{menuItems.find(item => item.id === tab)?.title || 'Panel de gestión'}</h1>
      </div>
      <button type="button" disabled={syncBusy} onclick={syncNow}
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-teal-700 hover:border-teal-300 disabled:opacity-50">
        {syncBusy ? 'Sincronizando…' : '↻ Sincronizar'}
      </button>
    </div>
    <section class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6" aria-label="Resumen de operaciones">
      {#each [{label:'Solicitudes',count:requests.length,id:'requests'}, {label:'Citas',count:appointments.length,id:'appointments'},
        {label:'Clientes',count:customers.length,id:'customers'}, {label:'Productos',count:products.length,id:'products'}] as item}
        <button class="rounded-2xl text-left bg-white border border-slate-200 shadow-sm p-4 hover:border-teal-500" onclick={() => tab = item.id as typeof tab}>
          <span class="block text-slate-500 text-xs uppercase tracking-wide">{item.label}</span>
          <span class="block text-3xl font-bold mt-2 text-slate-900">{item.count}</span>
        </button>
      {/each}
    </section>
    {#if error}<p role="alert" class="text-red-700 mb-4">{error}</p>{/if}
    {#if message}<p role="status" class="text-green-700 mb-4">{message}</p>{/if}
    {#if tab === 'customers'}
      <AdminCustomers {token} {customers} canManage={staffRole === 'admin'} onRefresh={async () => { await reload(); }} />
    {:else if tab === 'requests'}
      <div class="space-y-5">
        {#if staffRole === 'admin'}<AdminRequestCategories {token}/>{/if}
        <section class="space-y-3">
          <h2 class="text-xl font-extrabold text-slate-900">Solicitudes recibidas ({requestTotal})</h2>
          <form class="flex flex-col sm:flex-row gap-2 bg-white border border-slate-200 rounded-2xl p-3" onsubmit={searchRequest}>
            <label class="flex-1 text-xs font-bold text-slate-600">Buscar por ID, cliente, asunto, teléfono o correo
              <input type="search" bind:value={requestQuery} class="block w-full rounded-xl border border-slate-300 mt-1.5 px-3 py-3 text-sm font-normal" placeholder="Pega el ID completo o busca un nombre…" />
            </label>
            <div class="flex items-end gap-2"><button type="submit" disabled={pagingBusy} class="rounded-xl bg-teal-700 px-5 py-3 text-white font-bold text-sm">Buscar</button>
              <button type="button" onclick={() => { requestQuery = ''; void loadRequestPage(1); }} class="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">Limpiar</button></div>
          </form>
          {#if requests.length===0}<p class="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">Todavía no hay solicitudes.</p>{/if}
          <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
            {#each requests as r (r.id)}
              <article class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm min-w-0">
                <div class="flex flex-wrap justify-between gap-2 items-start">
                  <div class="min-w-0">
                    <p class="text-xs font-extrabold text-teal-700 uppercase">{r.category_name || r.type}</p>
                    <h3 class="text-base font-extrabold text-slate-900 mt-1 break-words">{r.title}</h3>
                    <p class="text-xs text-slate-500 mt-1">Ref. {r.id.slice(0,8).toUpperCase()} · {new Date(r.created_at).toLocaleString('es-CU')}</p>
                    <button type="button" onclick={() => copyReference(r.id)} title={r.id} class="text-[11px] text-teal-800 underline break-all text-left">
                      {copiedReference === r.id ? 'ID completo copiado ✓' : 'Copiar ID completo de solicitud'}
                    </button>
                  </div>
                  <select aria-label={'Estado de '+r.title} value={r.status}
                    onchange={e=>void changeRequest(r.id,e.currentTarget.value)}
                    class="border border-slate-300 bg-slate-50 rounded-xl text-xs px-2 py-2">
                    {#each ['pending','quoted','approved','scheduled','completed','cancelled'] as status}
                      <option value={status}>{status}</option>
                    {/each}
                  </select>
                </div>
                <div class="text-sm text-slate-600 space-y-1">
                  <p class="font-bold text-slate-800">{r.customer_name||'Cliente'}</p>
                  <p class="text-xs break-all">{r.phone||'Sin teléfono'} · {r.email||'Sin correo'}</p>
                  {#if r.location}<p class="text-xs">{r.location}</p>{/if}
                  <p class="text-sm whitespace-pre-line line-clamp-4">{r.description}</p>
                </div>
                <div class="flex gap-2 flex-wrap border-t border-slate-100 pt-3">
                  {#if r.phone && r.phone.replace(/\D/g,'').length>=8}
                    <a target="_blank" rel="noopener noreferrer"
                      href={'https://wa.me/'+r.phone.replace(/\D/g,'')+'?text='+encodeURIComponent('Hola '+(r.customer_name||'')+', te escribimos desde Bonaire sobre tu solicitud «'+r.title+'» (Ref. '+r.id.slice(0,8).toUpperCase()+'). ¿Podemos conversar?')}
                      class="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2.5"
                      aria-label={'Abrir WhatsApp del cliente '+(r.customer_name||'')}>☎ WhatsApp cliente</a>
                  {/if}
                  <button type="button" onclick={()=>requestPhotosOpen=requestPhotosOpen===r.id?'':r.id}
                    class="rounded-xl border border-teal-200 text-teal-800 font-bold text-xs px-3 py-2.5 hover:bg-teal-50">
                    ▧ {requestPhotosOpen===r.id?'Ocultar fotos':'Ver fotos ('+(r.image_count||0)+')'}
                  </button>
                </div>
                {#if requestPhotosOpen===r.id}
                  <RequestPhotoGallery {token} staff requestId={r.id}/>
                {/if}
              </article>
            {/each}
          </div>
          {#if requestTotal > pageSize}
            <nav class="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3" aria-label="Páginas de solicitudes">
              <p class="text-xs text-slate-600">Página {requestPage} de {Math.ceil(requestTotal/pageSize)} · {requestTotal} registros</p>
              <div class="flex gap-2">
                <button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" disabled={pagingBusy||requestPage===1} onclick={() => loadRequestPage(requestPage-1)}>Anterior</button>
                <button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" disabled={pagingBusy||requestPage>=Math.ceil(requestTotal/pageSize)} onclick={() => loadRequestPage(requestPage+1)}>Siguiente</button>
              </div>
            </nav>
          {/if}
        </section>
      </div>
    {:else if tab === 'appointments'}
      <section class="space-y-4">
        <h2 class="font-extrabold text-xl text-slate-900">Citas ({appointmentTotal})</h2>
        <form onsubmit={searchAppointment} class="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white border border-slate-200 p-3">
          <label class="flex-1 text-xs font-bold text-slate-600">Buscar cita por ID, cliente, asunto o teléfono
            <input type="search" bind:value={appointmentQuery} class="block w-full rounded-xl border border-slate-300 mt-1.5 px-3 py-3 font-normal text-sm" placeholder="Buscar cita o pegar su ID…" />
          </label>
          <div class="flex items-end gap-2">
            <button type="submit" disabled={pagingBusy} class="rounded-xl bg-teal-700 px-5 py-3 text-white font-bold text-sm">Buscar</button>
            <button type="button" onclick={() => { appointmentQuery=''; void loadAppointmentPage(1); }} class="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold">Limpiar</button>
          </div>
        </form>
        {#if !appointments.length}<p class="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">No hay citas con esos criterios.</p>{/if}
        <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
          {#each appointments as a (a.id)}
            <article class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm min-w-0">
              <div class="flex flex-wrap justify-between items-start gap-3">
                <div class="min-w-0">
                  <h3 class="font-extrabold text-slate-900">{a.title}</h3>
                  <p class="text-xs text-slate-500 mt-1">{a.customer_name || 'Cliente'} · {a.phone || 'Sin teléfono'}</p>
                  <p class="text-xs text-slate-500 mt-1">{new Date(a.starts_at).toLocaleString('es-CU')}</p>
                  <p class="text-[11px] break-all text-slate-500 mt-2" title={a.id}>ID: {a.id}</p>
                  <button type="button" onclick={() => copyReference(a.id)} class="text-xs text-teal-800 font-bold mt-1 underline">
                    {copiedReference===a.id?'Copiado ✓':'Copiar ID de cita'}
                  </button>
                </div>
                <select aria-label={'Estado de cita '+a.title} value={a.status} onchange={e=>void changeAppointment(a.id,e.currentTarget.value)}
                  class="border border-slate-300 rounded-xl text-xs px-2 py-2 bg-slate-50">
                  {#each ['pending','confirmed','in_progress','completed','cancelled'] as status}
                    <option value={status}>{status}</option>
                  {/each}
                </select>
              </div>
            </article>
          {/each}
        </div>
        {#if appointmentTotal > pageSize}
          <nav class="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3" aria-label="Páginas de citas">
            <p class="text-xs text-slate-600">Página {appointmentPage} de {Math.ceil(appointmentTotal/pageSize)} · {appointmentTotal} citas</p>
            <div class="flex gap-2">
              <button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" disabled={pagingBusy||appointmentPage===1} onclick={() => loadAppointmentPage(appointmentPage-1)}>Anterior</button>
              <button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" disabled={pagingBusy||appointmentPage>=Math.ceil(appointmentTotal/pageSize)} onclick={() => loadAppointmentPage(appointmentPage+1)}>Siguiente</button>
            </div>
          </nav>
        {/if}
      </section>
    {:else if staffRole === 'admin' && (tab === 'products' || tab === 'services' || tab === 'gallery' || tab === 'site')}
      <AdminContent {token} {tab} {products} {services} {categories} onRefresh={async () => { await reload(); }} />
    {:else if staffRole === 'admin' && tab === 'staff'}
      <AdminStaff {token} {ownId} />
    {:else if tab === 'notifications'}
      <AdminNotifications {token} {customers} canSend={staffRole === 'admin'} />
    {/if}
  {/if}
</div>
