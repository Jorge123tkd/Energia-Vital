<script lang="ts">
  import { onMount } from 'svelte';
  import { apiRequest } from '../lib/api';
  import StudioOperations from './StudioOperations.svelte';
  import StudioEngineeringFrame from './StudioEngineeringFrame.svelte';
  import StudioManagement from './StudioManagement.svelte';
  import StudioTechnicalShare from './StudioTechnicalShare.svelte';
  import StudioProjectReader from './StudioProjectReader.svelte';
  import {savedProjects} from '../lib/studio-technical-share.js';
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
  let businessError=$state(''),catalogError=$state(''),engineeringError=$state(''),engineeringProjects=$state<Project[]>([]),businessLoading=$state(false),catalogLoaded=$state(false),teamTab=$state('projects'),registrationBusy=$state(false),registrationMessage=$state(''),registrationError=$state('');
  let businessRun=0;
  const partialProjectsMessage='Listado parcial: carga más proyectos antes de registrar otro.';
  let unregistered=$derived(engineeringProjects.filter(p=>!projects.some(r=>r.id===p.id)));
  const query=(path:string)=>apiRequest('/api/studio/v1/'+path,{headers:{Authorization:'Bearer '+token}});
  async function refreshBusiness(section='all'){
    const run=++businessRun;businessLoading=true;
    const wantCatalog=section==='all'||section==='catalog';
    const wantProjects=section!=='catalog';
    const jobs:Promise<void>[]=[];
    if(wantProjects){
      businessError='';engineeringError='';
      jobs.push((async()=>{try{
        let page=await query('projects'),all:Project[]=Array.isArray(page.projects)?page.projects:[],cursor=page.next||null;
        // Fetch bounded pages; never infer a missing project from the first page alone.
        for(let n=1;cursor&&n<20;n++){const prior=cursor;page=await query('projects?'+new URLSearchParams({after:cursor}));all=[...all,...(page.projects??[])];cursor=page.next||null;if(cursor===prior)throw Error('Paginación de proyectos inválida');}
        if(run===businessRun){projects=all;nextProject=cursor;if(cursor)businessError=partialProjectsMessage}
      }catch(e){if(run===businessRun)businessError=(e as Error).message||'No se pudo consultar el registro de colaboración.'}})());
      if(isAdministrator)jobs.push((async()=>{try{const manifest=await query('engineering/manifest');const list=savedProjects(manifest.snapshot);if(run===businessRun)engineeringProjects=list}catch(e){if(run===businessRun)engineeringError=(e as Error).message||'No se pudo consultar ingeniería guardada.'}})());
    }
    if(wantCatalog)jobs.push((async()=>{catalogError='';try{
      const c=await query('catalog?page=1');if(run===businessRun){products=Array.isArray(c.products)?c.products:[];catalogPage=1;catalogMore=!!c.hasMore;catalogLoaded=true}
    }catch(e){if(run===businessRun){catalogError=(e as Error).message||'No se pudo consultar el catálogo.';catalogLoaded=false}}})());
    await Promise.all(jobs);if(run===businessRun)businessLoading=false;
  }
  async function registerProject(p:Project,section:string){
    if(registrationBusy||businessLoading||businessError||engineeringError||nextProject||!isAdministrator)return;
    if(!engineeringProjects.some(x=>x.id===p.id)||projects.some(x=>x.id===p.id))return;
    registrationBusy=true;registrationError='';registrationMessage='';
    try{
      const current=await query('engineering/manifest');
      const original=savedProjects(current.snapshot).find(x=>x.id===p.id);
      if(!original)throw Error('El expediente ya no figura en la revisión guardada.');
      await apiRequest('/api/studio/v1/projects',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({id:original.id,name:original.name})});
      registrationMessage='Proyecto vinculado con su identificador original. No se creó otro expediente técnico.';
      await refreshBusiness(section);
    }catch(e){registrationError=(e as Error&{status?:number}).status===503?'La vinculación empresarial está deshabilitada en el servidor. El expediente de ingeniería sigue intacto.':(e as Error).message||'No se confirmó la vinculación.'}
    finally{registrationBusy=false}
  }
  async function load(){
    const run=++generation;busy=true;error='';
    try{
      const me=await query('me');if(run!==generation)return;
      if(typeof me.user?.email!=='string'||!['admin','worker'].includes(me.user?.role))throw Error('Identidad de Studio no confirmada');
      account={email:me.user.email,role:me.user.role};isAdministrator=me.user.role==='admin';ready=true;
      // The original engineering program must not wait for optional commercial APIs.
      void refreshBusiness(desktopSection||'all');
    }catch(e){if(run===generation){const code=(e as Error&{status?:number}).status;error=code===403?'Tu cuenta no tiene acceso a Studio.':(e as Error).message||'No se pudo verificar Studio.'}}
    finally{if(run===generation)busy=false}
  }
  async function find(page=1){
    if(!ready||busy||businessLoading)return;
    const run=++generation;busy=true;catalogError='';
    try{const d=await query('catalog?'+new URLSearchParams({page:String(page),search}));
      if(run===generation){products=d.products??[];catalogPage=page;catalogMore=!!d.hasMore;catalogLoaded=true;}
    }catch(e){if(run===generation){catalogError=(e as Error).message||'No se pudo consultar el catálogo.';catalogLoaded=false;}}
    finally{if(run===generation)busy=false;}
  }
  async function moreProjects(){
    if(!ready||busy||businessLoading||registrationBusy||!nextProject)return;
    const run=++generation;busy=true;error='';
    try{const d=await query('projects?'+new URLSearchParams({after:nextProject}));
      if(run===generation){const next=d.next||null;if(next===nextProject)throw Error('Paginación de proyectos inválida');const known=new Set(projects.map(p=>p.id));projects=[...projects,...(d.projects??[]).filter((p:Project)=>!known.has(p.id))];nextProject=next;businessError=next?partialProjectsMessage:'';}
    }catch{if(run===generation){businessError='No se pudieron consultar más proyectos.';}}
    finally{if(run===generation)busy=false;}
  }
  onMount(()=>{void load();return()=>{generation++;businessRun++;};});
</script>
{#snippet business(section:string)}
  {#if section!=='catalog'&&businessError}<p role="alert" class="rounded-lg bg-amber-50 p-3 mb-3">{businessError}</p>{/if}
  {#if section!=='catalog'&&engineeringError}<p role="alert" class="rounded-lg bg-amber-50 p-3 mb-3">{engineeringError}</p>{/if}
  {#if isAdministrator&&['team','finance','inventory','backup','publication'].includes(section)}
   <section class="rounded-xl border bg-white p-4 mb-4 space-y-2"><div class="flex flex-wrap justify-between gap-2"><h3 class="font-bold">Expedientes y vinculación empresarial</h3><button type="button" class="border rounded-lg px-3 py-1 text-sm" disabled={businessLoading} onclick={()=>refreshBusiness(section)}>{businessLoading?'Consultando…':'Actualizar expedientes'}</button></div><p class="text-sm">Ingeniería guardada: {engineeringProjects.length} · Registro empresarial: {projects.length} · Pendientes de vincular: {unregistered.length}</p><p class="text-xs text-slate-600">Los expedientes de ingeniería son la base original. La vinculación registra su mismo ID para asignaciones, almacén y economía; no duplica el proyecto ni comparte archivos o costos privados.</p>
   {#if unregistered.length&&!businessLoading}<div class="max-h-64 overflow-auto divide-y">{#each unregistered as p (p.id)}<div class="flex flex-wrap justify-between items-center gap-2 py-2"><span class="text-sm">{p.name}</span><button type="button" class="border rounded-lg px-3 py-1 text-sm" disabled={registrationBusy||!!businessError||!!engineeringError||!!nextProject} onclick={()=>registerProject(p,section)}>Vincular expediente</button></div>{/each}</div>{/if}
   {#if nextProject}<button type="button" disabled={busy||businessLoading||registrationBusy} onclick={moreProjects} class="text-sm text-teal-800 underline">Cargar más proyectos antes de vincular</button>{/if}
   {#if registrationError}<p role="alert" class="bg-amber-50 p-2 text-sm">{registrationError}</p>{/if}{#if registrationMessage}<p role="status" class="bg-teal-50 p-2 text-sm">{registrationMessage}</p>{/if}
   </section>
  {/if}
  {#if section==='team'&&isAdministrator}<div class="flex flex-wrap gap-2 mb-4">{#each [{id:'projects',name:'Expedientes vinculados'},{id:'staff',name:'Personal y permisos'},{id:'share',name:'Compartir y revisar tareas'},{id:'conflicts',name:'Resolver conflictos'}] as t}<button type="button" class={teamTab===t.id?'rounded-lg bg-teal-800 text-white px-3 py-2 text-sm':'rounded-lg border px-3 py-2 text-sm'} onclick={()=>teamTab=t.id}>{t.name}</button>{/each}</div>{/if}
  {#if section==='catalog'||section==='assigned'||section==='team'}
        <div class="space-y-4">
      {#if section!=='catalog'&&(section!=='team'||teamTab==='projects')}
      <section class="rounded-2xl border bg-white p-4 space-y-3 min-w-0"><h3 class="font-extrabold">Expedientes compartidos</h3><p class="text-xs text-slate-500">Son las secciones autorizadas del expediente original, no una segunda lista de proyectos de ingeniería.</p>
        {#if projects.length===0&&!businessLoading&&!businessError}<p class="text-sm text-slate-500">No hay expedientes vinculados a colaboración. Los proyectos de ingeniería se conservan.</p>{/if}
        {#each projects as p (p.id)}<div class="border-t py-3 break-words"><p class="font-semibold">{p.name}</p><p class="text-xs text-slate-500 break-all">Ref. {p.id}</p><button type="button" class="mt-2 rounded-lg border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-800" onclick={()=>selectedProject=p}>Abrir secciones del proyecto</button></div>{/each}
        {#if nextProject&&!isAdministrator}<button type="button" disabled={busy||businessLoading} onclick={moreProjects} class="text-sm text-teal-800 underline">Cargar más proyectos</button>{/if}
      </section>
      {/if}
      {#if section!=='team'}
      <section class="rounded-2xl border bg-white p-4 space-y-3 min-w-0"><h3 class="font-extrabold">Catálogo de Bonaire</h3>
        <form onsubmit={(e)=>{e.preventDefault();void find(1);}} class="flex gap-2 flex-wrap">
          <input aria-label="Buscar productos" type="search" maxlength="100" bind:value={search} placeholder="Nombre, marca, modelo" class="flex-1 min-w-0 rounded-lg border p-2 text-sm"/>
          <button type="submit" disabled={busy||businessLoading} class="rounded-lg bg-teal-700 text-white p-2 text-sm">Buscar</button>
        </form>
        <p class="text-xs text-slate-500">Productos activos publicados por Bonaire. No son la biblioteca técnica ni las existencias físicas. La edición del catálogo corresponde a la administración comercial.</p>
        {#if catalogError}<p role="alert" class="bg-amber-50 p-2 text-sm">{catalogError}</p>{:else if businessLoading}<p role="status" class="text-sm">Consultando catálogo…</p>{/if}
        {#each products as p (p.id)}<div class="border-t py-3"><p class="font-semibold break-words">{p.name}</p><p class="text-xs text-slate-500">{p.brand||''} {p.model||''} · Existencia: {p.publishedStock??'Sin confirmar'}</p></div>{/each}
        {#if catalogLoaded&&!products.length&&!catalogError}<p class="text-sm text-slate-500">{search?'No hay productos que coincidan con la búsqueda.':'No hay productos activos publicados en el catálogo de Bonaire.'}</p>{/if}
        <div class="flex gap-3 text-sm"><button type="button" disabled={busy||businessLoading||catalogPage===1} onclick={()=>find(catalogPage-1)} class="text-teal-800 disabled:opacity-40">Anterior</button><span>Página {catalogPage}</span><button type="button" disabled={busy||businessLoading||!catalogMore} onclick={()=>find(catalogPage+1)} class="text-teal-800 disabled:opacity-40">Siguiente</button></div>
      </section>
      {/if}
    </div>
    {#if section!=='catalog'&&selectedProject&&(section!=='team'||teamTab==='projects')}{#key selectedProject.id}<StudioProjectReader {token} project={selectedProject}/>{/key}{/if}

    {#if section==='team'&&isAdministrator}
      <div class="space-y-4 mt-4">{#if teamTab==='share'}<StudioTechnicalShare {token} {projects} onRefresh={()=>refreshBusiness('team')}/>{:else if teamTab==='staff'}<StudioManagement {token} {projects} onRefresh={()=>refreshBusiness('team')}/>{:else if teamTab==='conflicts'}<StudioOperations {token} {projects} initialMode="conflicts" embedded={true}/>{/if}</div>
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
  <StudioEngineeringFrame {token} {business} {onExit} {onLogout} {account} onBusinessOpen={refreshBusiness}/>
{:else if ready}
  <main class="min-h-screen bg-slate-50 p-5 space-y-4"><header class="flex justify-between items-center"><h1 class="text-2xl font-bold">EV Pro Studio · Proyectos asignados</h1><div class="flex flex-wrap items-center gap-3"><span class="text-sm">{account.email}</span><button type="button" class="border rounded-lg px-3 py-2" onclick={onExit}>Volver a Bonaire</button><button type="button" class="border rounded-lg px-3 py-2" onclick={onLogout}>Cerrar sesión</button></div></header>{@render business('assigned')}</main>
{:else}
  <main class="fixed inset-0 bg-[#f1f6f5] grid place-items-center p-5"><section class="max-w-lg w-full rounded-xl bg-white border p-6 space-y-4"><h1 class="text-2xl font-bold">EV Pro Studio</h1>{#if error}<p role="alert">{error}</p><button type="button" class="rounded-lg border px-4 py-2" onclick={load}>Reintentar conexión</button>{:else}<p role="status">Verificando sesión de Bonaire…</p>{/if}<button type="button" class="rounded-lg border px-4 py-2" onclick={onExit}>Volver a Bonaire</button></section></main>
{/if}
