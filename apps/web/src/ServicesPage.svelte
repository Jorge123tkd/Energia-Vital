<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import CardImage from './components/CardImage.svelte';
  import Pagination from './components/Pagination.svelte';
  let { featured = false }: { featured?: boolean } = $props();
  let services:any[]=$state([]);
  let page=$state(1);
  let perPage = $derived(featured ? 8 : 12);
  let pages=$derived(Math.max(1,Math.ceil(services.length/perPage)));
  let visibleServices=$derived(services.slice((Math.min(page,pages)-1)*perPage,Math.min(page,pages)*perPage));
  let loading=$state(true),error=$state('');
  let selected:any=$state(null),images:{id:string;url:string}[]=$state([]);
  let photoIndex=$state(0),loadingPhotos=$state(false);
  onMount(()=>{
    api.getServices(featured).then(r=>{services=r.services??[];})
      .catch(e=>error=e instanceof Error?e.message:'No se pudieron cargar los servicios.')
      .finally(()=>loading=false);
  });
  function request(service:any){window.location.href='/contacto?service_id='+encodeURIComponent(service.id);}
  function price(service:any){
    return service.price_type==='fixed'&&service.price!=null
      ? Number(service.price).toLocaleString('es-CU')+' USD'
      :service.price_type==='free'?'Gratuito':'Bajo presupuesto';
  }
  async function details(service:any){
    selected=service;photoIndex=0;images=service.image_url?[{id:'cover',url:service.image_url}]:[];
    loadingPhotos=true;
    try{
      const res=await api.getServiceImages(service.id);
      if(selected?.id!==service.id)return;
      const list=res.images||[];
      images=list.length?list:(service.image_url?[{id:'cover',url:service.image_url}]:[]);
    }catch{/* Si falla la galería, se conserva la foto principal. */}
    finally{loadingPhotos=false;}
  }
  function close(){selected=null;images=[];}
</script>
<svelte:window onkeydown={e=>{
  if(!selected)return;
  if(e.key==='Escape')close();
  if(e.key==='ArrowRight')photoIndex=(photoIndex+1)%Math.max(1,images.length);
  if(e.key==='ArrowLeft')photoIndex=(photoIndex+Math.max(1,images.length)-1)%Math.max(1,images.length);
}}/>
<section class={featured ? "w-full" : "w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-8"}>
  {#if !featured}
  <header class="mb-8">
    <span class="text-xs font-extrabold tracking-widest uppercase text-teal-700">Bonaire · Asistencia especializada</span>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">Servicios para tu tranquilidad</h1>
    <p class="text-slate-600 mt-3 max-w-2xl">Desde la planificación hasta el mantenimiento. Te acompañamos para aprovechar al máximo tu inversión solar.</p>
  </header>
  {/if}
  {#if loading}<p class="text-slate-500">Cargando servicios…</p>
  {:else if error}<p role="alert" class="text-red-700">{error}</p>
  {:else if !services.length}<div class="rounded-2xl bg-white p-8 border border-slate-200 text-slate-600">{featured ? "Pronto publicaremos servicios destacados." : "Pronto publicaremos nuestros servicios."}</div>
  {:else}
    <div class="grid grid-cols-1 min-[500px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
      {#each visibleServices as service (service.id)}
        <article class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col hover:shadow-lg transition">
          <button type="button" onclick={()=>details(service)} class="w-full relative overflow-hidden bg-teal-50" aria-label={'Ver fotos de '+service.name}>
            <CardImage src={service.image_url} alt={service.name} />
          </button>
          <div class="p-4 flex flex-col flex-1 space-y-2">
            <h2 class="font-extrabold text-sm sm:text-base text-slate-900 line-clamp-2">{service.name}</h2>
            <p class="text-xs text-slate-600 line-clamp-3 flex-1">{service.description||'Consulta los detalles del servicio con nuestro equipo.'}</p>
            <p class="font-bold text-sm text-teal-800">{price(service)}</p>
            <div class="grid grid-cols-2 gap-2 pt-2">
              <button type="button" onclick={()=>details(service)} class="rounded-xl border border-teal-200 text-teal-800 text-xs font-bold px-2 py-2.5">Detalles</button>
              <button type="button" onclick={()=>request(service)} class="rounded-xl bg-teal-700 text-white text-xs font-bold px-2 py-2.5 hover:bg-teal-800">Solicitar</button>
            </div>
          </div>
        </article>
      {/each}
    </div>
    <Pagination page={Math.min(page,pages)} total={services.length} perPage={perPage}
      label="servicios" onPage={n => page = n} />
  {/if}
</section>
{#if selected}
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5">
    <button type="button" onclick={close} aria-label="Cerrar detalles" class="absolute inset-0 bg-slate-950/80"></button>
    <dialog open aria-label={'Servicio '+selected.name} class="relative m-0 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <div class="sticky top-0 bg-white z-10 border-b border-slate-100 flex justify-between items-start gap-4 px-5 py-4">
        <div><p class="text-xs uppercase font-bold text-teal-700">Bonaire · Servicios</p><h2 class="font-extrabold text-xl text-slate-900 mt-1">{selected.name}</h2></div>
        <button type="button" onclick={close} aria-label="Cerrar" class="rounded-xl bg-slate-100 w-10 h-10 shrink-0">✕</button>
      </div>
      <div class="p-5 space-y-4">
        {#if images.length}
          <div class="relative">
            <img src={images[photoIndex]?.url||images[0].url} alt={selected.name} class="w-full h-60 sm:h-[340px] rounded-2xl object-contain bg-slate-100"/>
            {#if images.length>1}
              <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <button type="button" class="rounded-full bg-slate-950/80 text-white w-10 h-10" onclick={()=>photoIndex=(photoIndex+images.length-1)%images.length}>‹</button>
                <span class="bg-slate-950/80 text-white rounded-lg px-3 py-1.5 text-xs">{photoIndex+1} / {images.length}</span>
                <button type="button" class="rounded-full bg-slate-950/80 text-white w-10 h-10" onclick={()=>photoIndex=(photoIndex+1)%images.length}>›</button>
              </div>
            {/if}
          </div>
          {#if images.length>1}
            <div class="flex gap-2 overflow-x-auto">
              {#each images as photo,i (photo.id)}
                <button type="button" onclick={()=>photoIndex=i} aria-label={'Mostrar foto '+(i+1)}
                  class="rounded-xl border-2 {photoIndex===i?'border-teal-700':'border-slate-200'} p-1 shrink-0">
                  <img src={photo.url} alt="" class="w-16 h-14 rounded-lg object-cover"/>
                </button>
              {/each}
            </div>
          {/if}
        {:else if loadingPhotos}<p>Cargando fotos…</p>{/if}
        <p class="text-sm text-slate-700 whitespace-pre-line">{selected.description||'Consulta los detalles de este servicio con Bonaire.'}</p>
        {#if selected.scope}<p class="text-sm text-slate-600 border-l-4 border-teal-500 pl-4 whitespace-pre-line">{selected.scope}</p>{/if}
        <p class="text-lg text-teal-800 font-extrabold">{price(selected)}</p>
        <button type="button" onclick={()=>request(selected)} class="rounded-xl w-full bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3">Solicitar este servicio →</button>
      </div>
    </dialog>
  </div>
{/if}
