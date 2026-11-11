<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, authorizedImageBlob } from '../lib/api';

  let { requestId, token = '', staff = false, canUpload = false }: {
    requestId: string; token?: string; staff?: boolean; canUpload?: boolean;
  } = $props();
  type Item = { id: string; preview: string };
  let images: Item[] = $state([]);
  let pending: { file: File; url: string }[] = $state([]);
  let loading = $state(true);
  let sending = $state(false);
  let error = $state('');
  let notice = $state('');
  function revoke() {
    images.forEach(i=>URL.revokeObjectURL(i.preview));
    pending.forEach(i=>URL.revokeObjectURL(i.url));
    images=[]; pending=[];
  }
  onDestroy(revoke);

  async function load() {
    error='';loading=true;
    try {
      const result = staff ? await api.getStaffRequestImages(token, requestId) : await api.getMyRequestImages(requestId);
      const source = result.images || [];
      const next: Item[] = [];
      for (const row of source) {
        const path = staff
          ? '/api/admin-customers/extras/requests/images/' + encodeURIComponent(row.id)
          : '/api/private/extras/requests/images/' + encodeURIComponent(row.id);
        try {
          const blob = await authorizedImageBlob(path, token || undefined);
          next.push({ id: row.id, preview: URL.createObjectURL(blob) });
        } catch { error='Algunas fotografías no se pudieron descargar.'; }
      }
      images.forEach(i=>URL.revokeObjectURL(i.preview));
      images=next;
    } catch(e) { error=e instanceof Error?e.message:'No se pudieron cargar las fotos'; }
    finally { loading=false; }
  }
  onMount(() => { void load(); });
  function select(files: FileList|null) {
    if(!files)return;
    error='';
    for(const file of Array.from(files)) {
      if(pending.length+images.length>=5) {error='Máximo cinco fotos por solicitud.';break;}
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024) {
        error='Usa JPG, PNG o WebP de hasta 8 MB.';continue;
      }
      pending=[...pending,{file,url:URL.createObjectURL(file)}];
    }
  }
  function remove(index:number) {
    URL.revokeObjectURL(pending[index].url);
    pending=pending.filter((_,i)=>i!==index);
  }
  async function upload() {
    if(!pending.length)return;
    sending=true;error='';notice='';
    let uploaded=0;
    for(const item of [...pending]) {
      try {
        await api.uploadRequestImage(requestId,item.file);
        uploaded++;
      }catch(e) {error=e instanceof Error?e.message:'Algunas imágenes no se guardaron';break;}
    }
    for(const item of pending.slice(0,uploaded))URL.revokeObjectURL(item.url);
    pending=pending.slice(uploaded);
    notice=uploaded?'Se guardaron '+uploaded+' nuevas fotos.':'';
    sending=false;
    await load();
  }
</script>

<section class="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-3" aria-label="Fotografías de la solicitud">
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-sm font-extrabold text-slate-800">Fotografías de la solicitud</h3>
    <button type="button" disabled={loading} onclick={load} class="text-xs font-semibold text-teal-700">↻ Actualizar</button>
  </div>
  {#if loading}<p class="text-xs text-slate-500">Cargando fotos privadas…</p>{/if}
  {#if error}<p role="alert" class="text-xs text-red-700">{error}</p>{/if}
  {#if notice}<p role="status" class="text-xs text-emerald-700">{notice}</p>{/if}
  {#if images.length}
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {#each images as photo (photo.id)}
        <a href={photo.preview} target="_blank" rel="noopener noreferrer" class="block rounded-xl overflow-hidden border border-slate-200 bg-white">
          <img src={photo.preview} alt="Fotografía adjunta por el cliente" loading="lazy" class="w-full h-28 object-cover" />
        </a>
      {/each}
    </div>
  {:else if !loading}
    <p class="text-xs text-slate-500">Esta solicitud todavía no tiene fotografías.</p>
  {/if}
  {#if canUpload && !staff && images.length<5}
    <label class="block text-xs font-semibold text-slate-700">Añadir fotos
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple
        class="block w-full mt-1.5 text-xs" onchange={e=>{select(e.currentTarget.files);e.currentTarget.value='';}} />
    </label>
    {#if pending.length}
      <div class="flex gap-2 overflow-x-auto">
        {#each pending as photo,i (photo.url)}
          <div class="relative shrink-0"><img src={photo.url} alt="Vista previa" class="w-20 h-20 object-cover rounded-lg" />
            <button type="button" onclick={()=>remove(i)} aria-label="Quitar foto" class="absolute top-0 right-0 rounded-full bg-white text-red-700 px-1.5">✕</button>
          </div>
        {/each}
      </div>
      <button type="button" disabled={sending} onclick={upload} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs px-4 py-2.5">
        {sending?'Subiendo…':'Guardar fotos en Bonaire'}
      </button>
    {/if}
  {/if}
</section>
