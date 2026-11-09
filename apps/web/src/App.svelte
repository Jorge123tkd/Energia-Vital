<script lang="ts">
  import { onMount } from 'svelte';
  import Nav from './components/Nav.svelte';
  import Footer from './components/Footer.svelte';
  import Assistant from './components/Assistant.svelte';
  import CustomerAccess from './components/CustomerAccess.svelte';
  import CustomerProfile from './components/CustomerProfile.svelte';
  import MyRequests from './components/MyRequests.svelte';
  import HomePage from './HomePage.svelte';
  import CatalogPage from './CatalogPage.svelte';
  import ServicesPage from './ServicesPage.svelte';
  import SolarAdvisorPage from './SolarAdvisorPage.svelte';
  import GalleryPage from './GalleryPage.svelte';
  import ContactPage from './ContactPage.svelte';
  import AdminPage from './AdminPage.svelte';
  import { api, customerToken, setCustomerToken, ADMIN_TOKEN_KEY } from './lib/api';
  import { isAssistantOpen, assistantSessionId, assistantMessages } from './lib/store';

  const publicRoutes = new Set(['/', '/catalogo', '/servicios', '/galeria']);
  const LOGIN_ACTION_KEY = 'energia_vital_login_action';
  let currentRoute = $state(window.location.pathname || '/');
  let user: any = $state(null);
  let checking = $state(true);

  onMount(() => {
    const handler = () => { currentRoute = window.location.pathname || '/'; };
    window.addEventListener('popstate', handler);
    void restoreSession();
    return () => window.removeEventListener('popstate', handler);
  });
  async function restoreSession() {
    const admin = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (admin) {
      try {
        const result = await api.adminMe(admin);
        user = { ...result.user, name: 'Administrador', account_type: 'admin' };
        checking = false;
        return;
      } catch { sessionStorage.removeItem(ADMIN_TOKEN_KEY); }
    }
    if (customerToken()) {
      try { const result = await api.me(); user = result.user; }
      catch { setCustomerToken(null); }
    }
    checking = false;
  }

  function navigate(path: string) {
    currentRoute = path.split('?')[0] || '/';
    history.pushState(null, '', path);
    window.scrollTo(0, 0);
  }

  function openAssistant() {
    if (user?.role === 'admin') {
      navigate('/perfil');
      return;
    }
    if (user) {
      isAssistantOpen.set(true);
      return;
    }
    sessionStorage.setItem(LOGIN_ACTION_KEY, 'assistant');
    navigate('/entrar?next=%2F');
  }

  function onAuthenticated(customer: any, token: string) {
    if (customer.role === 'admin') {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setCustomerToken(null);
    } else {
      setCustomerToken(token);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
    user = customer;
    assistantSessionId.set(null);
    assistantMessages.set([]);
    const queryNext = new URLSearchParams(window.location.search).get('next');
    const pending = (!publicRoutes.has(currentRoute) && !['/entrar', '/registro', '/admin'].includes(currentRoute))
      ? window.location.pathname + window.location.search : '/';
    const target = queryNext && queryNext.startsWith('/') && !queryNext.startsWith('//') && !queryNext.startsWith('/admin')
      ? queryNext : pending;
    navigate(customer.role === 'admin' ? '/perfil' : target);
    if (customer.role !== 'admin' && sessionStorage.getItem(LOGIN_ACTION_KEY) === 'assistant') {
      sessionStorage.removeItem(LOGIN_ACTION_KEY);
      isAssistantOpen.set(true);
    }
  }

  async function signOut() {
    const admin = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    try {
      if (admin) await api.logoutAdmin(admin);
      else await api.logout();
    } catch { /* Una sesión caducada también se cierra localmente. */ }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setCustomerToken(null);
    user = null;
    assistantSessionId.set(null);
    assistantMessages.set([]);
    isAssistantOpen.set(false);
    navigate('/');
  }
</script>

{#if currentRoute === '/admin'}
  <AdminPage />
{:else if checking}
  <div class="min-h-screen flex justify-center items-center text-gray-600">Verificando tu sesión…</div>
{:else}
  <Nav {navigate} customerName={user?.name || (user?.role === 'admin' ? 'Administrador' : '')} onLogout={signOut} onAssistant={openAssistant} />
  {#if currentRoute === '/entrar' || currentRoute === '/registro' || (!user && !publicRoutes.has(currentRoute))}
    <CustomerAccess onSuccess={onAuthenticated} initialMode={currentRoute === '/registro' ? 'register' : 'login'} />
  {:else}
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen">
      {#if currentRoute === '/'}<HomePage onAssistant={openAssistant} />
      {:else if currentRoute === '/catalogo'}<CatalogPage />
      {:else if currentRoute === '/servicios'}<ServicesPage />
      {:else if currentRoute === '/asesor-solar'}<SolarAdvisorPage />
      {:else if currentRoute === '/galeria'}<GalleryPage />
      {:else if currentRoute === '/contacto'}<ContactPage />
      {:else if currentRoute === '/perfil' && user?.role === 'admin'}
        <section class="max-w-3xl mx-auto my-10 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <span class="text-xs font-bold uppercase tracking-widest text-teal-700">Cuenta administrativa</span>
          <h1 class="text-3xl font-bold text-slate-900">Mi perfil</h1>
          <p class="text-slate-600">Has iniciado sesión como administrador de Energía Vital.</p>
          <p class="text-sm text-slate-500">Correo: <strong>{user.email}</strong></p>
          <a class="inline-flex items-center rounded-xl bg-teal-700 text-white font-bold px-6 py-3 hover:bg-teal-800" href="/admin">
            Entrar al panel de administración →
          </a>
          <p class="text-sm text-slate-500">Por seguridad, las solicitudes y el asistente para clientes requieren una cuenta de cliente independiente.</p>
        </section>
      {:else if user?.role === 'admin' && !publicRoutes.has(currentRoute)}
        <section class="max-w-xl mx-auto my-14 rounded-2xl bg-white border border-slate-200 p-8 text-center space-y-4">
          <h1 class="font-bold text-2xl">Área reservada para clientes</h1>
          <p class="text-slate-600">Tu cuenta administrativa tiene acceso al panel de gestión. Para crear solicitudes o pedir citas necesitas una cuenta de cliente.</p>
          <a class="inline-block rounded-xl px-5 py-3 bg-teal-700 text-white font-semibold" href="/admin">Ir a administración</a>
        </section>
      {:else if currentRoute === '/perfil'}<CustomerProfile {user} onUpdate={(updated: any) => { user = updated; }} />
      {:else if currentRoute === '/mis-solicitudes'}<MyRequests />
      {:else}<HomePage onAssistant={openAssistant} />{/if}
    </main>
    {#if user && user.role !== 'admin' && $isAssistantOpen}
      <div class="fixed bottom-5 right-3 sm:right-6 z-[100]"><Assistant userId={user.id} onContact={() => navigate('/contacto')} /></div>
    {/if}
  {/if}
  <Footer />
{/if}
