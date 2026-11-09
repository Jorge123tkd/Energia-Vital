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
  import { api, customerToken, setCustomerToken } from './lib/api';
  import { isAssistantOpen, assistantSessionId, assistantMessages } from './lib/store';

  const publicRoutes = new Set(['/', '/catalogo', '/servicios', '/galeria']);
  const LOGIN_ACTION_KEY = 'energia_vital_login_action';
  let currentRoute = $state(window.location.pathname || '/');
  let user: any = $state(null);
  let checking = $state(true);

  onMount(() => {
    const handler = () => { currentRoute = window.location.pathname || '/'; };
    window.addEventListener('popstate', handler);
    if (customerToken()) {
      api.me().then(r => { user = r.user; })
        .catch(() => setCustomerToken(null))
        .finally(() => { checking = false; });
    } else checking = false;
    return () => window.removeEventListener('popstate', handler);
  });

  function navigate(path: string) {
    currentRoute = path.split('?')[0] || '/';
    history.pushState(null, '', path);
    window.scrollTo(0, 0);
  }

  function openAssistant() {
    if (user) {
      isAssistantOpen.set(true);
      return;
    }
    sessionStorage.setItem(LOGIN_ACTION_KEY, 'assistant');
    navigate('/entrar?next=%2F');
  }

  function onAuthenticated(customer: any, token: string) {
    setCustomerToken(token);
    user = customer;
    assistantSessionId.set(null);
    assistantMessages.set([]);
    const queryNext = new URLSearchParams(window.location.search).get('next');
    const pending = (!publicRoutes.has(currentRoute) && !['/entrar', '/registro', '/admin'].includes(currentRoute))
      ? window.location.pathname + window.location.search : '/';
    const target = queryNext && queryNext.startsWith('/') && !queryNext.startsWith('//') && !queryNext.startsWith('/admin')
      ? queryNext : pending;
    navigate(target);
    if (sessionStorage.getItem(LOGIN_ACTION_KEY) === 'assistant') {
      sessionStorage.removeItem(LOGIN_ACTION_KEY);
      isAssistantOpen.set(true);
    }
  }

  async function signOut() {
    try { await api.logout(); } catch { /* Una sesión caducada también se cierra localmente. */ }
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
  <Nav {navigate} customerName={user?.name || ''} onLogout={signOut} onAssistant={openAssistant} />
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
      {:else if currentRoute === '/perfil'}<CustomerProfile {user} onUpdate={(updated: any) => { user = updated; }} />
      {:else if currentRoute === '/mis-solicitudes'}<MyRequests />
      {:else}<HomePage onAssistant={openAssistant} />{/if}
    </main>
    {#if user && $isAssistantOpen}
      <div class="fixed bottom-5 right-3 sm:right-6 z-[100]"><Assistant userId={user.id} onContact={() => navigate('/contacto')} /></div>
    {/if}
  {/if}
  <Footer />
{/if}
