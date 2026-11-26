<script lang="ts">
  import { onMount } from 'svelte';
  import Nav from './components/Nav.svelte';
  import NotificationsPage from './components/NotificationsPage.svelte';
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
  import { isAdminPath } from './lib/admin-navigation';
  import ChiefPortal from './ChiefPortal.svelte';
  import StudioDesktopOperations from './components/StudioDesktopOperations.svelte';
  import { api, customerToken, setCustomerToken, logoutCurrentSession, setCustomerRefreshToken, setAdminRefreshToken, clearAdminSession, ADMIN_TOKEN_KEY, restorePublicBrowserAccess } from './lib/api';
  import { isAssistantOpen, assistantSessionId, assistantMessages } from './lib/store';

  const publicRoutes = new Set(['/', '/catalogo', '/servicios', '/galeria', '/asesor-solar']);
  const LOGIN_ACTION_KEY = 'energia_vital_login_action';
  let currentRoute = $state(window.location.pathname || '/');
  let user: any = $state(null);
  let checking = $state(true);
  let restoreGeneration=0;
  let assistantFullScreen = $derived(currentRoute === '/asistente' && Boolean(user) &&
    user.account_type !== 'admin' && user.role !== 'admin' && user.role !== 'operator');

  onMount(() => {
    const handler = () => { const wasAdmin=isAdminPath(currentRoute);currentRoute = window.location.pathname || '/';if(wasAdmin&&!isAdminPath(currentRoute))void restoreSession(); };
    const signedOut=(event:StorageEvent)=>{if(event.key==='energia_vital_admin_signed_out'&&event.newValue==='1'){restoreGeneration++;checking=false;clearAdminSession();setCustomerToken(null);user=null;assistantSessionId.set(null);assistantMessages.set([]);isAssistantOpen.set(false);}};
    window.addEventListener('popstate', handler);
    window.addEventListener('storage',signedOut);
    void restoreSession();
    return () => {window.removeEventListener('popstate', handler);window.removeEventListener('storage',signedOut);};
  });
  async function restoreSession() {
    // AdminPage restores its own session: never rotate the same cookie twice.
    if(isAdminPath(window.location.pathname)||window.location.pathname==='/studio-desktop-operations'){checking=false;return;}
    const generation=++restoreGeneration;
    checking=true;user=null;
    try {
      const saved=await restorePublicBrowserAccess();
      if(!saved||generation!==restoreGeneration)return;
      try{
        if(saved.kind==='admin'){
          const result=await api.adminMe(saved.token);
          if(generation===restoreGeneration)user={...result.user,name:result.user.role==='operator'?'Moderador':'Administrador',account_type:'admin'};
        }else{const result=await api.me();if(generation===restoreGeneration)user=result.user;}
      }catch(e){
        const status=(e as Error&{status?:number})?.status;
        if(generation===restoreGeneration&&(status===401||status===403)){if(saved.kind==='admin')clearAdminSession();else setCustomerToken(null);}
      }
    }catch{ /* No bloquear la navegación pública si el servicio temporalmente falla. */ }
    finally{if(generation===restoreGeneration)checking=false;}
  }

  function navigate(path: string) {
    if (path.split('?')[0] === '/asistente') isAssistantOpen.set(false);
    currentRoute = path.split('?')[0] || '/';
    history.pushState(null, '', path);
    window.scrollTo(0, 0);
  }

  function openAssistant() {
    if ((user?.account_type === 'admin' || user?.role === 'admin' || user?.role === 'operator')) {
      navigate('/perfil');
      return;
    }
    if (user) {
      if (currentRoute !== '/asistente') isAssistantOpen.set(true);
      return;
    }
    sessionStorage.setItem(LOGIN_ACTION_KEY, 'assistant');
    navigate('/entrar?next=%2F');
  }

  function openAssistantPage() {
    isAssistantOpen.set(false);
    navigate('/asistente');
  }

  function onAuthenticated(customer: any, token: string, refreshToken?: string, browserSession=false) {
    restoreGeneration++;checking=false;
    // The cookie bridge already stored the matching access and isolated the roles.
    if (!browserSession && (customer.account_type === 'admin' || customer.role === 'admin' || customer.role === 'operator')) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setAdminRefreshToken(refreshToken || null);
      setCustomerToken(null);
    } else if(!browserSession) {
      setCustomerToken(token);
      setCustomerRefreshToken(refreshToken || null);
      clearAdminSession();
    }
    user = customer;
    assistantSessionId.set(null);
    assistantMessages.set([]);
    const queryNext = new URLSearchParams(window.location.search).get('next');
    const pending = (!publicRoutes.has(currentRoute) && !['/entrar', '/registro', '/admin'].includes(currentRoute))
      ? window.location.pathname + window.location.search : '/';
    const target = queryNext && queryNext.startsWith('/') && !queryNext.startsWith('//') && !queryNext.startsWith('/admin')
      ? queryNext : pending;
    navigate((customer.account_type === 'admin' || customer.role === 'admin' || customer.role === 'operator') ? '/perfil' : target);
    if (customer.account_type !== 'admin' && customer.role !== 'admin' && customer.role !== 'operator' && sessionStorage.getItem(LOGIN_ACTION_KEY) === 'assistant') {
      sessionStorage.removeItem(LOGIN_ACTION_KEY);
      isAssistantOpen.set(true);
    }
  }

  async function signOut() {
    restoreGeneration++;checking=false;
    const admin = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    // logoutCurrentSession elimina las credenciales locales sin esperar la red.
    try{await logoutCurrentSession(admin ? 'admin' : 'customer');}
    catch{window.alert('Se cerró el acceso en este navegador, pero no se pudo confirmar el cierre remoto. Comprueba tu conexión.');}
    user = null;
    assistantSessionId.set(null);
    assistantMessages.set([]);
    isAssistantOpen.set(false);
    navigate('/');
  }
</script>

{#if currentRoute === '/studio-desktop-operations'}
  <StudioDesktopOperations />
{:else if currentRoute === '/jefe-brigada'}
  <ChiefPortal />
{:else if isAdminPath(currentRoute)}
  <AdminPage />
{:else if checking}
  <div class="min-h-screen flex justify-center items-center text-gray-600">Verificando tu sesión…</div>
{:else}
  {#if !assistantFullScreen}
  <Nav {navigate} customerName={user?.name || ((user?.account_type === 'admin' || user?.role === 'admin' || user?.role === 'operator') ? 'Administrador' : '')} userRole={user?.role || 'customer'} onLogout={signOut} onAssistant={openAssistant} />
  {/if}
  {#if currentRoute === '/entrar' || currentRoute === '/registro' || (!user && !publicRoutes.has(currentRoute))}
    <CustomerAccess onSuccess={onAuthenticated} initialMode={currentRoute === '/registro' ? 'register' : 'login'} />
  {:else}
    <main class={assistantFullScreen
      ? 'w-full h-[100dvh] max-w-none overflow-hidden m-0 p-0'
      : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen'}>
      {#if currentRoute === '/'}<HomePage onAssistant={openAssistant} />
      {:else if currentRoute === '/catalogo'}<CatalogPage />
      {:else if currentRoute === '/servicios'}<ServicesPage />
      {:else if currentRoute === '/asesor-solar'}<SolarAdvisorPage />
      {:else if currentRoute === '/asistente' && user && user.account_type !== 'admin' && user.role !== 'admin' && user.role !== 'operator'}
        <Assistant fullPage userId={user.id} onContact={() => navigate('/contacto')}
          onAdvisor={() => navigate('/asesor-solar')} onBack={() => navigate('/')} />
      {:else if currentRoute === '/notificaciones'}<NotificationsPage staff={user?.account_type === 'admin' || user?.role === 'admin' || user?.role === 'operator'} token={sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''} />
      {:else if currentRoute === '/galeria'}<GalleryPage />
      {:else if currentRoute === '/contacto'}<ContactPage />
      {:else if currentRoute === '/perfil' && (user?.account_type === 'admin' || user?.role === 'admin' || user?.role === 'operator')}
        <section class="max-w-3xl mx-auto my-10 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <span class="text-xs font-bold uppercase tracking-widest text-teal-700">Cuenta administrativa</span>
          <h1 class="text-3xl font-bold text-slate-900">Mi perfil</h1>
          <p class="text-slate-600">Has iniciado sesión como miembro del equipo de Bonaire.</p>
          <p class="text-sm text-slate-500">Correo: <strong>{user.email}</strong></p>
          <a class="inline-flex items-center rounded-xl bg-teal-700 text-white font-bold px-6 py-3 hover:bg-teal-800" href="/admin">
            Entrar al panel de administración →
          </a>
          <p class="text-sm text-slate-500">Por seguridad, las solicitudes y el asistente para clientes requieren una cuenta de cliente independiente.</p>
        </section>
      {:else if (user?.account_type === 'admin' || user?.role === 'admin' || user?.role === 'operator') && !publicRoutes.has(currentRoute)}
        <section class="max-w-xl mx-auto my-14 rounded-2xl bg-white border border-slate-200 p-8 text-center space-y-4">
          <h1 class="font-bold text-2xl">Área reservada para clientes</h1>
          <p class="text-slate-600">Tu cuenta administrativa tiene acceso al panel de gestión. Para crear solicitudes o pedir citas necesitas una cuenta de cliente.</p>
          <a class="inline-block rounded-xl px-5 py-3 bg-teal-700 text-white font-semibold" href="/admin">Ir a administración</a>
        </section>
      {:else if currentRoute === '/perfil'}<CustomerProfile {user} onUpdate={(updated: any) => { user = updated; }} />
      {:else if currentRoute === '/mis-solicitudes'}<MyRequests />
      {:else}<HomePage onAssistant={openAssistant} />{/if}
    </main>
    {#if user && user.account_type !== 'admin' && user.role !== 'admin' && user.role !== 'operator' && $isAssistantOpen}
      <div class="fixed bottom-5 right-3 sm:right-6 z-[100]"><Assistant userId={user.id}
        onContact={() => navigate('/contacto')} onExpand={openAssistantPage}
        onAdvisor={() => { isAssistantOpen.set(false); navigate('/asesor-solar'); }} /></div>
    {/if}
  {/if}
  {#if currentRoute !== '/asistente'}<Footer />{/if}
{/if}
