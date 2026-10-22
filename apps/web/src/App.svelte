<script lang="ts">
  import Nav from './components/Nav.svelte';
  import Footer from './components/Footer.svelte';
  import Assistant from './components/Assistant.svelte';
  import HomePage from './HomePage.svelte';
  import CatalogPage from './CatalogPage.svelte';
  import ServicesPage from './ServicesPage.svelte';
  import SolarAdvisorPage from './SolarAdvisorPage.svelte';
  import GalleryPage from './GalleryPage.svelte';
  import ContactPage from './ContactPage.svelte';
  import AdminPage from './AdminPage.svelte';
  import { isAssistantOpen } from './lib/store';

  let currentRoute = $state('/');

  // Inicializa la ruta en cliente
  currentRoute = window.location.pathname || '/';

  function navigate(path: string) {
    currentRoute = path;
    history.pushState(null, '', path);
  }

  window.addEventListener('popstate', () => {
    currentRoute = window.location.pathname || '/';
  });
</script>

<nav class="w-full"><Nav {navigate} /></nav>

<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 min-h-screen">
  {#if currentRoute === '/'}
    <HomePage />
  {:else if currentRoute === '/catalogo'}
    <CatalogPage />
  {:else if currentRoute === '/servicios'}
    <ServicesPage />
  {:else if currentRoute === '/asesor-solar'}
    <SolarAdvisorPage />
  {:else if currentRoute === '/galeria'}
    <GalleryPage />
  {:else if currentRoute === '/contacto'}
    <ContactPage />
  {:else if currentRoute === '/admin'}
    <AdminPage />
  {:else}
    <HomePage />
  {/if}
</main>

{#if $isAssistantOpen}
  <div class="fixed bottom-6 right-6 z-[100]">
    <Assistant />
  </div>
{/if}

<footer class="w-full"><Footer /></footer>
