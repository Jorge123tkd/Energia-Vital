<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import ImagePicker from './ImagePicker.svelte';
  let { token, id, kind, onUpdated }: {
    token:string; id:string; kind:'product'|'service'|'gallery';onUpdated:()=>Promise<void>
  }=$props();
  type Image={id:string;url:string;is_primary?:number};
  let images:Image[]=$state([]);
  let pending:File[]=$state([]);
  let busy=$state(false),loading=$state(true),error=$state(''),notice=$state('');
  let serial=$state(0);
  async function load(){
    loading=true;
    try{
      const response=kind==='product'?await api.getAdminProductImages(token,id)
        :kind==='service'?await api.getAdminServiceImages(token,id):await api.getAdminGalleryImages(token,id);
      images=response.images||[];
    }catch(e){error=e instanceof Error?e.message:'Error al cargar fotografías';}
    finally{loading=false;}
  }
  onMount(()=>{void load();});
  async function upload(){
    if(!pending.length)return;
    busy=true;error='';notice='';
    let saved=0;
    try{
      if(pending.length+images.length>(kind==='gallery'?15:kind==='service'?10:15))
        throw new Error('Superaste el límite de fotografías para esta ficha.');
      for(const file of pending){
        if(kind==='product')await api.uploadProductImage(token,id,file);
        else if(kind==='service')await api.uploadAdminServiceImage(token,id,file);
        else await api.uploadAdminGalleryImage(token,id,file);
        saved+=1;
      }
      notice='Se guardaron '+saved+' imágenes nuevas.';
      pending=[];serial+=1;
      await load();await onUpdated();
    }catch(e){
      error=(e instanceof Error?e.message:'No se pudo subir la imagen')+
        (saved?' ('+saved+' de '+pending.length+' guardadas).':'');
      if(saved){pending=pending.slice(saved);serial+=1;await load();await onUpdated();}
    }finally{busy=false;}
  }
  async function remove(pic:Image){
    if(!confirm('¿Quitar esta fotografía de la ficha? Esta acción no se puede deshacer.'))return;
    busy=true;error='';notice='';
    try{
      if(kind==='product')await api.deleteAdminProductImage(token,id,pic.id);
      else if(kind==='service')await api.deleteAdminServiceImage(token,id,pic.id);
      else await api.deleteAdminGalleryImage(token,id,pic.id);
      await load();await onUpdated();notice='Fotografía eliminada.';
    }catch(e){error=e instanceof Error?e.message:'No se pudo eliminar';}
    finally{busy=false;}
  }
</script>
<section class="rounded-2xl border border-slate-200 p-3 sm:p-4 space-y-3" aria-label="Fotografías guardadas en Bonaire">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-extrabold text-slate-900">Fotografías guardadas ({images.length})</h3>
    <button type="button" disabled={busy} onclick={load} class="text-xs text-teal-800 font-bold">↻ Actualizar</button>
  </div>
  {#if loading}<p class="text-xs text-slate-500">Cargando imágenes…</p>{/if}
  {#if error}<p role="alert" class="text-xs text-red-700 bg-red-50 rounded-xl p-2">{error}</p>{/if}
  {#if notice}<p role="status" class="text-xs text-emerald-700">{notice}</p>{/if}
  {#if images.length}
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {#each images as photo,i (photo.id)}
        <div class="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          {#if photo.url}<img src={photo.url} alt={'Fotografía '+(i+1)} class="w-full h-28 object-cover" loading="lazy"/>{/if}
          {#if photo.is_primary}<span class="absolute top-1 left-1 bg-teal-700 text-white text-[10px] px-2 py-1 rounded-lg">Principal</span>{/if}
          <button type="button" disabled={busy} class="w-full bg-white p-2 text-xs text-red-700 font-bold hover:bg-red-50" onclick={()=>remove(photo)}>Eliminar foto</button>
        </div>
      {/each}
    </div>
  {:else if !loading}<p class="text-xs text-slate-500">Todavía no hay fotografías en esta ficha.</p>{/if}
  {#key serial}
    <ImagePicker max={kind==='gallery'?15:kind==='service'?10:15} label="Añadir más fotografías"
      onFiles={(files)=>pending=files}/>
  {/key}
  {#if pending.length}
    <button type="button" disabled={busy} onclick={upload} class="w-full rounded-xl bg-teal-700 text-white font-bold text-sm py-3">
      {busy?'Subiendo…':'Guardar '+pending.length+' fotos en Cloudflare R2'}
    </button>
  {/if}
</section>
