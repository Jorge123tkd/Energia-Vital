<script lang="ts">
  import { onMount } from 'svelte';
  import Nav from './components/Nav.svelte';
  import Footer from './components/Footer.svelte';
  import HomePage from './HomePage.svelte';
  import CatalogPage from './CatalogPage.svelte';
  import ServicesPage from './ServicesPage.svelte';
  import SolarAdvisorPage from './SolarAdvisorPage.svelte';
  import GalleryPage from './GalleryPage.svelte';
  import ContactPage from './ContactPage.svelte';
  import AdminPage from './AdminPage.svelte';

  let currentRoute = '/';
  
  function navigate(path: string) {
    currentRoute = path;
    history.pushState(null, '', path);
  }

  onMount(() => {
    window.addEventListener('popstate', () => {
      currentRoute = window.location.pathname;
    });
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

<footer class="w-full"><Footer /></footer>

<style>
  main {
    display: block;
  }
</style>