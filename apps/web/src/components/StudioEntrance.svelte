<script lang="ts">
  import { onMount } from 'svelte';
  import { apiRequest } from '../lib/api';
  import StudioOperations from './StudioOperations.svelte';
  import StudioEngineeringFrame from './StudioEngineeringFrame.svelte';
  import StudioManagement from './StudioManagement.svelte';
  import StudioTechnicalShare from './StudioTechnicalShare.svelte';
  import StudioProjectReader from './StudioProjectReader.svelte';
  let {token,onExit,onLogout,desktopSection=''}: {token:string;onExit:()=>void;onLogout:()=>Promise<void>;desktopSection?:string} = $props();
  const names:Record<string,string>={catalog:'Catálogo comercial',team:'Colaboración y permisos',inventory:'Almacén y compras',finance:'Finanzas y compromisos',backup:'Copias de secciones compartidas',publication:'Publicaciones comerciales'};
  let account=$state({email:'',role:'worker'});
  type Project = {id:string;name:string};
  type Product = {id:string;name:string;brand:string|null;model:string|null;publishedStock:number|null};
  let busy=$state(false),ready=$state(false),error=$state(''),projects=$state<Project[]>([]),products=$state<Product[]>([]);
  let search=$state(''),nextProject=$state<string|null>(null),catalogPage=$state(1),catalogMore=$state(false);
  let generation=0;
  let isAdministrator=$state(false);
  let selectedProject=$state<Project|null>(null);
  let businessError=$state('');
  const query=(path:string)=>apiRequest('/api/studio/v1/'+path,{headers:{Authorization:'Bearer '+token}});
  async function refreshBusiness(){
    try{
      const [p,c]=await Promise.all([query('projects'),query('catalog?page=1')]);
      projects=Array.isArray(p.projects)?p.projects:[];nextProject=p.next||null;
      products=Array.isArray(c.products)?c.products:[];catalogPage=1;catalogMore=!!c.hasMore;
      businessError='';
    }catch(e){businessError=(e as Error).message||'No se pudieron consultar los módulos empresariales.'}
  }
  async function load(){
    const run=++generation;busy=true;error='';
    try{
      const me=await query('me');if(run!==generation)return;
      if(typeof me.user?.email!=='string'||!['admin','worker'].includes(me.user?.role))throw Error('Identidad de Studio no confirmada');
      account={email:me.user.email,role:me.user.role};isAdministrator=me.user.role==='admin';ready=true;
      // The original engineering program must not wait for optional commercial APIs.
      void refreshBusiness();
    }catch(e){if(run===generation){const code=(e as Error&{status?:number}).status;error=code===403?'Tu cuenta no tiene acceso a Studio.':(e as Error).message||'No se pudo verificar Studio.'}}
    finally{if(run===generation)busy=false}
  }
  async function find(page=1){
    if(!ready||busy)return;
    const run=++generation;busy=true;error='';
    try{const d=await query('catalog?'+new URLSearchParams({page:String(page),search}));
      if(run===generation){products=d.products??[];catalogPage=page;catalogMore=!!d.hasMore;}
    }catch{if(run===generation){products=[];catalogMore=false;businessError='No se pudo consultar el catálogo.';}}
    finally{if(run===generation)busy=false;}
  }
  async function moreProjects(){
    if(!ready||busy||!nextProject)return;
    const run=++generation;busy=true;error='';
    try{const d=await query('projects?'+new URLSearchParams({after:nextProject}));
      if(run===generation){projects=[...projects,...(d.projects??[])];nextProject=d.next||null;}
    }catch{if(run===generation){projects=[];products=[];businessError='No se pudieron consultar los proyectos.';}}
    finally{if(run===generation)busy=false;}
  }
  onMount(()=>{void load();return()=>{generation++;};});
</script>
{#snippet business(section:string)}
  {#if businessError}<p role="alert" class="rounded-lg bg-amber-50 p-3 mb-3">{businessError}</p>{/if}
  {#if section==='catalog'||section==='assigned'||section==='team'}
        <div class="space-y-4">
      {#if section!=='catalog'}
      <section class="rounded-2xl border bg-white p-4 space-y-3 min-w-0"><h3 class="font-extrabold">Expedientes compartidos</h3><p class="text-xs text-slate-500">Son las secciones autorizadas del expediente original, no una segunda lista de proyectos de ingeniería.</p>
        {#if projects.length===0}<p class="text-sm text-slate-500">No tienes proyectos disponibles.</p>{/if}
        {#each projects as p (p.id)}<div class="border-t py-3 break-words"><p class="font-semibold">{p.name}</p><p class="text-xs text-slate-500 break-all">Ref. {p.id}</p><button type="button" class="mt-2 rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800" onclick={()=>selectedProject=p}>Abrir secciones del proyecto</button></div>{/each}
        {#if nextProject}<button type="button" disabled={busy} onclick={moreProjects} class="text-sm text-teal-800 underline">Cargar más proyectos</button>{/if}
      </section>
      {/if}
      {#if section!=='team'}
      <section class="rounded-2xl border bg-white p-4 space-y-3 min-w-0"><h3 class="font-extrabold">Catálogo de Bonaire</h3>
        <form onsubmit={(e)=>{e.preventDefault();void find(1);}} class="flex gap-2 flex-wrap">
          <input aria-label="Buscar productos" type="search" maxlength="100" bind:value={search} placeholder="Nombre, marca, modelo" class="flex-1 min-w-0 rounded-lg border p-2 text-sm"/>
          <button type="submit" disabled={busy} class="rounded-lg bg-teal-700 text-white p-2 text-sm">Buscar</button>
        </form>
        <p class="text-xs text-slate-500">La existencia publicada no es una reserva de almacén.</p>
        {#each products as p (p.id)}<div class="border-t py-3"><p class="font-semibold break-words">{p.name}</p><p class="text-xs text-slate-500">{p.brand||''} {p.model||''} · Existencia: {p.publishedStock??'Sin confirmar'}</p></div>{/each}
        {#if !products.length}<p class="text-sm text-slate-500">No hay resultados.</p>{/if}
        <div class="flex gap-3 text-sm"><button type="button" disabled={busy||catalogPage===1} onclick={()=>find(catalogPage-1)} class="text-teal-800 disabled:opacity-40">Anterior</button><span>Página {catalogPage}</span><button type="button" disabled={busy||!catalogMore} onclick={()=>find(catalogPage+1)} class="text-teal-800 disabled:opacity-40">Siguiente</button></div>
      </section>
      {/if}
    </div>
    {#if section!=='catalog'&&selectedProject}{#key selectedProject.id}<StudioProjectReader {token} project={selectedProject}/>{/key}{/if}

    {#if section==='team'&&isAdministrator}
      <div class="space-y-4 mt-4"><StudioTechnicalShare {token} {projects} onRefresh={refreshBusiness}/><StudioManagement {token} {projects} onRefresh={refreshBusiness}/><StudioOperations {token} {projects} initialMode="conflicts" embedded={true}/></div>
    {/if}
  {:else if ['inventory','finance','backup','publication'].includes(section)}
    {#key section}<StudioOperations {token} {projects} initialMode={section as 'inventory'|'finance'|'backup'|'publication'} embedded={true} procurementGroup={section==='inventory'}/>{/key}
  {/if}
{/snippet}
{#if desktopSection}
  <section class="min-h-screen bg-[#f1f6f5] text-[#18323a]">
    <header class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-3">
      <span class="text-sm text-slate-600">Studio / {names[desktopSection]||'Operaciones Bonaire'}</span>
      <div class="flex flex-wrap items-center gap-2"><button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={onExit}>Volver a ingeniería</button><span class="text-xs">{account.email}</span><button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={onLogout}>Cerrar sesión</button></div>
    </header>
    <main class="max-w-[1540px] mx-auto px-6 py-8">
      <h1 class="text-2xl font-bold mb-5">{names[desktopSection]||'Operaciones Bonaire'}</h1>
      {#if ready&&isAdministrator&&Object.hasOwn(names,desktopSection)}
        {@render business(desktopSection)}
      {:else if error}<p role="alert">{error}</p><button type="button" class="border rounded-lg px-3 py-2" onclick={load}>Reintentar conexión</button>
      {:else if ready}<p role="alert">Acceso de administrador requerido.</p>
      {:else}<p role="status">Verificando sesión de Bonaire…</p>{/if}
    </main>
  </section>
{:else if ready&&isAdministrator}
  <StudioEngineeringFrame {token} {business} {onExit} {onLogout} {account}/>
{:else if ready}
  <main class="min-h-screen bg-slate-50 p-5 space-y-4"><header class="flex justify-between items-center"><h1 class="text-2xl font-bold">EV Pro Studio · Proyectos asignados</h1><div class="flex flex-wrap items-center gap-3"><span class="text-sm">{account.email}</span><button type="button" class="border rounded-lg px-3 py-2" onclick={onExit}>Volver a Bonaire</button><button type="button" class="border rounded-lg px-3 py-2" onclick={onLogout}>Cerrar sesión</button></div></header>{@render business('assigned')}</main>
{:else}
  <main class="fixed inset-0 bg-[#f1f6f5] grid place-items-center p-5"><section class="max-w-lg w-full rounded-xl bg-white border p-6 space-y-4"><h1 class="text-2xl font-bold">EV Pro Studio</h1>{#if error}<p role="alert">{error}</p><button type="button" class="rounded-lg border px-4 py-2" onclick={load}>Reintentar conexión</button>{:else}<p role="status">Verificando sesión de Bonaire…</p>{/if}<button type="button" class="rounded-lg border px-4 py-2" onclick={onExit}>Volver a Bonaire</button></section></main>
{/if}
