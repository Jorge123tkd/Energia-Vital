<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import CardImage from './components/CardImage.svelte';
  import Pagination from './components/Pagination.svelte';
  let { featured = false }: { featured?: boolean } = $props();
  type Project = {id:string;title:string;description?:string;category?:string;url?:string;image_count?:number};
  type Photo = {id:string;url:string};
  let gallery:Project[]=$state([]);
  let categories:{id:string;name:string}[]=$state([]);
  let category=$state('');
  let search=$state('');
  let page=$state(1);
  const perPage = featured ? 8 : 12;
  let loading=$state(true),error=$state('');
  let selected:Project|null=$state(null);
  let images:Photo[]=$state([]),photoIndex=$state(0),loadingPhotos=$state(false);
  let filtered=$derived(gallery.filter(p=>
    (!category || p.category===category) &&
    (!search || [p.title,p.description,p.category].some(x=>(x||'').toLowerCase().includes(search.toLowerCase().trim())))
  ));
  let pages=$derived(Math.max(1,Math.ceil(filtered.length/perPage)));
  let visibleProjects=$derived(filtered.slice((Math.min(page,pages)-1)*perPage,Math.min(page,pages)*perPage));
  onMount(async()=>{
    try{
      const [g,c]=await Promise.all([api.getGallery(featured),featured ? Promise.resolve({categories:[]}) : api.getGalleryCategories()]);
      gallery=g.gallery||[];categories=c.categories||[];
    }catch(e){error=e instanceof Error?e.message:'No se pudo cargar la galería';}
    finally{loading=false;}
  });
  async function show(project:Project){
    selected=project;photoIndex=0;images=project.url?[{id:'cover',url:project.url}]:[];
    loadingPhotos=true;
    try{
      const found=(await api.getGalleryImages(project.id)).images||[];
      if(selected?.id!==project.id)return;
      images=found.length?found:(project.url?[{id:'cover',url:project.url}]:[]);
    }catch{/* La foto de portada sigue disponible. */}
    finally{loadingPhotos=false;}
  }
  function close(){selected=null;images=[];photoIndex=0;}
  function request(project:Project){window.location.href='/contacto?reference='+encodeURIComponent(project.title);}
</script>
<svelte:window onkeydown={(event)=>{
  if(!selected)return;
  if(event.key==='Escape')close();
  if(event.key==='ArrowLeft')photoIndex=(photoIndex+images.length-1)%Math.max(1,images.length);
  if(event.key==='ArrowRight')photoIndex=(photoIndex+1)%Math.max(1,images.length);
}}/>
<div class={featured ? "w-full" : "min-h-[calc(100vh-6rem)] bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 px-3 sm:px-6 py-7 sm:py-10"}>
  <div class="w-full max-w-[1600px] mx-auto space-y-6">
    {#if !featured}
    <header class="rounded-3xl bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 p-6 sm:p-10 text-white shadow-xl">
      <span class="uppercase tracking-widest text-teal-200 font-extrabold text-xs">Bonaire · Trabajos realizados</span>
      <h1 class="mt-3 text-3xl sm:text-5xl font-extrabold">Nuestros proyectos</h1>
      <p class="mt-4 text-teal-50 max-w-3xl text-sm sm:text-lg">Explora instalaciones, mantenimientos y soluciones que hemos realizado. Abre cualquier proyecto para ver todas sus fotografías.</p>
    </header>

    <section class="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-4" aria-label="Buscar proyectos">
      <input type="search" aria-label="Buscar proyectos" bind:value={search} oninput={() => page = 1} placeholder="Buscar por proyecto o descripción…" class="block w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-teal-600"/>
      <div class="flex flex-wrap gap-2">
        <button type="button" aria-pressed={category===''} onclick={()=>{ category=''; page=1; }} class="rounded-full px-4 py-2 text-sm font-semibold {category===''?'bg-teal-700 text-white':'bg-slate-100 text-slate-600 hover:bg-teal-50'}">Todos</button>
        {#each categories as cat (cat.id)}
          <button type="button" aria-pressed={category===cat.name} onclick={()=>{ category=cat.name; page=1; }}
            class="rounded-full px-4 py-2 text-sm font-semibold {category===cat.name?'bg-teal-700 text-white':'bg-slate-100 text-slate-600 hover:bg-teal-50'}">{cat.name}</button>
        {/each}
      </div>
    </section>

    <div class="flex items-end justify-between gap-3"><h2 class="font-extrabold text-2xl text-slate-900">Trabajos de Bonaire</h2><span class="text-sm text-slate-500">{filtered.length} proyectos</span></div>
    {/if}
    {#if loading}<p class="rounded-xl bg-white p-6 text-slate-500">Cargando proyectos…</p>
    {:else if error}<p role="alert" class="rounded-xl bg-red-50 text-red-700 p-4">{error}</p>
    {:else if !filtered.length}<div class="rounded-2xl bg-white border border-slate-200 p-8 text-center text-slate-600">{featured ? "Pronto publicaremos proyectos destacados." : "No encontramos proyectos con esos filtros."}</div>
    {:else}
      <div class="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
        {#each visibleProjects as work (work.id)}
          <article class="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-lg transition">
            <button type="button" class="block relative w-full bg-slate-100 overflow-hidden" onclick={()=>show(work)} aria-label={'Ver fotografías de '+work.title}>
              <CardImage src={work.url} alt={work.title} />
              {#if work.image_count}<span class="absolute right-2 bottom-2 bg-slate-950/80 text-white rounded-full px-2.5 py-1 text-[11px] font-bold">▧ {work.image_count} fotos</span>{/if}
            </button>
            <div class="flex flex-col flex-1 p-4 gap-2">
              <p class="text-xs text-teal-700 font-bold uppercase">{work.category||'Proyecto Bonaire'}</p>
              <h3 class="font-extrabold text-slate-900 text-sm sm:text-base line-clamp-2">{work.title}</h3>
              <p class="text-xs text-slate-600 line-clamp-2 flex-1">{work.description||'Trabajo realizado por nuestro equipo.'}</p>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <button type="button" onclick={()=>show(work)} class="rounded-xl border border-teal-200 bg-teal-50 text-teal-800 text-xs font-bold p-2.5">Ver fotos</button>
                <button type="button" onclick={()=>request(work)} class="rounded-xl bg-teal-700 text-white text-xs font-bold p-2.5">Consultar</button>
              </div>
            </div>
          </article>
        {/each}
      </div>
      <Pagination page={Math.min(page,pages)} total={filtered.length} perPage={perPage}
        label="proyectos" onPage={n => page = n} />
    {/if}
  </div>
</div>

{#if selected}
  <div class="fixed inset-0 z-[200] p-3 sm:p-6 flex justify-center items-center">
    <button type="button" class="absolute inset-0 bg-slate-950/80" aria-label="Cerrar proyecto" onclick={close}></button>
    <dialog open aria-label={'Fotografías del proyecto '+selected.title} class="relative m-0 w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <header class="sticky top-0 bg-white z-10 border-b border-slate-200 p-4 sm:p-5 flex justify-between gap-3 items-start">
        <div><p class="text-xs font-bold text-teal-700 uppercase">{selected.category||'Bonaire'}</p><h2 class="font-extrabold text-slate-900 text-lg sm:text-2xl mt-1">{selected.title}</h2></div>
        <button type="button" onclick={close} aria-label="Cerrar" class="rounded-xl bg-slate-100 text-slate-700 font-bold w-10 h-10 shrink-0">✕</button>
      </header>
      <div class="p-4 sm:p-6 space-y-5">
        {#if images.length}
          <div class="relative bg-slate-100 rounded-2xl overflow-hidden">
            <img src={images[photoIndex]?.url||images[0].url} alt={'Fotografía '+(photoIndex+1)+' de '+selected.title} class="w-full h-56 sm:h-[420px] object-contain"/>
            {#if images.length>1}
              <div class="absolute bottom-3 inset-x-3 flex justify-between items-center">
                <button type="button" class="bg-slate-950/75 text-white w-10 h-10 rounded-full" onclick={()=>photoIndex=(photoIndex+images.length-1)%images.length}>‹</button>
                <span class="bg-slate-950/75 text-white rounded-xl px-3 py-2 text-sm font-bold">{photoIndex+1} / {images.length}</span>
                <button type="button" class="bg-slate-950/75 text-white w-10 h-10 rounded-full" onclick={()=>photoIndex=(photoIndex+1)%images.length}>›</button>
              </div>
            {/if}
          </div>
          {#if images.length>1}
            <div class="flex overflow-x-auto gap-2 py-1">
              {#each images as photo,i (photo.id)}
                <button type="button" onclick={()=>photoIndex=i} aria-pressed={photoIndex===i} aria-label={'Mostrar foto '+(i+1)}
                  class="shrink-0 rounded-xl p-1 border-2 {photoIndex===i?'border-teal-700':'border-slate-200'}">
                  <img src={photo.url} alt="" class="w-20 h-16 object-cover rounded-lg"/>
                </button>
              {/each}
            </div>
          {/if}
        {:else if loadingPhotos}<p class="p-8 text-center text-slate-500">Cargando fotografías…</p>
        {:else}<p class="p-8 text-center text-slate-500">Este proyecto no tiene fotografías.</p>{/if}
        <p class="text-sm sm:text-base text-slate-600 whitespace-pre-line">{selected.description||'Trabajo de nuestro equipo.'}</p>
        <button type="button" onclick={()=>request(selected!)} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3">Solicitar un proyecto similar →</button>
      </div>
    </dialog>
  </div>
{/if}
