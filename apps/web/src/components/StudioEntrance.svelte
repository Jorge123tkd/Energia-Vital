<script lang="ts">
  import { onMount } from 'svelte';
  import { apiRequest } from '../lib/api';
  import StudioOperations from './StudioOperations.svelte';
  import StudioManagement from './StudioManagement.svelte';
  import StudioProjectReader from './StudioProjectReader.svelte';
  let {token}: {token:string} = $props();
  type Project = {id:string;name:string};
  type Product = {id:string;name:string;brand:string|null;model:string|null;publishedStock:number|null};
  let busy=$state(false),ready=$state(false),error=$state(''),status=$state(''),projects=$state<Project[]>([]),products=$state<Product[]>([]);
  let search=$state(''),nextProject=$state<string|null>(null),catalogPage=$state(1),catalogMore=$state(false);
  let generation=0;
  let isAdministrator=$state(false);
  let selectedProject=$state<Project|null>(null);
  const query=(path:string)=>apiRequest('/api/studio/v1/'+path,{headers:{Authorization:'Bearer '+token}});
  async function load(){
    const run=++generation;busy=true;ready=false;error='';status='';projects=[];products=[];nextProject=null;catalogMore=false;selectedProject=null;
    try{
      const me=await query('me');
      if(run!==generation)return;
      isAdministrator=me.user?.role==='admin';
      const [p,c]=await Promise.all([query('projects'),query('catalog?page=1')]);
      if(run!==generation)return;
      projects=Array.isArray(p.projects)?p.projects:[];nextProject=p.next||null;
      products=Array.isArray(c.products)?c.products:[];catalogPage=1;catalogMore=!!c.hasMore;
      ready=true;status='Sesión de Studio verificada';
    }catch(e){
      if(run!==generation)return;
      const code=(e as Error&{status?:number}).status;
      error=code===503?'Studio está en preparación o temporalmente desconectado.':code===403?'Tu cuenta aún no tiene autorización para EV Pro Studio.':code===401?'Tu sesión ha vencido. Vuelve a iniciar sesión.':'No se pudo verificar Studio.';
    }finally{if(run===generation)busy=false;}
  }
  async function find(page=1){
    if(!ready||busy)return;
    const run=++generation;busy=true;error='';
    try{const d=await query('catalog?'+new URLSearchParams({page:String(page),search}));
      if(run===generation){products=d.products??[];catalogPage=page;catalogMore=!!d.hasMore;}
    }catch{if(run===generation){products=[];catalogMore=false;ready=false;error='No se pudo confirmar el acceso o consultar el catálogo. Reintenta la conexión.';}}
    finally{if(run===generation)busy=false;}
  }
  async function moreProjects(){
    if(!ready||busy||!nextProject)return;
    const run=++generation;busy=true;error='';
    try{const d=await query('projects?'+new URLSearchParams({after:nextProject}));
      if(run===generation){projects=[...projects,...(d.projects??[])];nextProject=d.next||null;}
    }catch{if(run===generation){projects=[];products=[];ready=false;error='No se pudo confirmar el acceso a los proyectos. Reintenta la conexión.';}}
    finally{if(run===generation)busy=false;}
  }
  onMount(()=>{void load();return()=>{generation++;};});
</script>
<section class="space-y-5" aria-label="EV Pro Studio">
  <header class="rounded-2xl bg-slate-900 text-white p-5 sm:p-7 flex flex-wrap items-center justify-between gap-4">
    <div><p class="uppercase tracking-widest text-xs text-teal-300 font-bold">Bonaire · Ingeniería y operaciones</p>
      <h2 class="text-2xl font-extrabold mt-2">EV Pro Studio</h2>
      <p class="text-sm text-slate-300 mt-2">Acceso integrado a la plataforma empresarial. Primera etapa de conexión, solo lectura.</p>
    </div>
    <button type="button" onclick={load} disabled={busy} class="rounded-xl bg-teal-700 text-white font-semibold px-4 py-3 disabled:opacity-50">{busy?'Verificando…':'Verificar conexión'}</button>
  </header>
  {#if error}<p role="alert" class="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">{error}</p>{/if}
  {#if ready}
    <p role="status" class="text-sm text-teal-800 font-semibold">{status}</p>
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border bg-white p-4 space-y-3 min-w-0"><h3 class="font-extrabold">Proyectos autorizados</h3>
        {#if projects.length===0}<p class="text-sm text-slate-500">No tienes proyectos disponibles.</p>{/if}
        {#each projects as p (p.id)}<div class="border-t py-3 break-words"><p class="font-semibold">{p.name}</p><p class="text-xs text-slate-500 break-all">Ref. {p.id}</p><button type="button" class="mt-2 rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800" onclick={()=>selectedProject=p}>Abrir secciones del proyecto</button></div>{/each}
        {#if nextProject}<button type="button" disabled={busy} onclick={moreProjects} class="text-sm text-teal-800 underline">Cargar más proyectos</button>{/if}
      </section>
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
    </div>
    {#if selectedProject}{#key selectedProject.id}<StudioProjectReader {token} project={selectedProject}/>{/key}{/if}
    {#if isAdministrator}<StudioManagement {token} {projects} onRefresh={load}/><StudioOperations {token} {projects}/>{/if}
  {:else if !busy}
    <section class="rounded-xl bg-white border p-5 text-sm text-slate-600">La versión completa de ingeniería, sincronización y respaldos se habilitará tras las pruebas de seguridad. No se crean cuentas nuevas desde aquí.</section>
  {/if}
</section>
