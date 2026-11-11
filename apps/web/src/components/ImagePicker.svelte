<script lang="ts">
  import { onDestroy } from 'svelte';
  let { onFiles, max = 10, label = 'Fotografías' }: {onFiles:(files:File[])=>void;max?:number;label?:string}=$props();
  type Entry={file:File;preview:string};
  let picked:Entry[]=$state([]);
  let error=$state('');
  function select(files:FileList|null){
    if(!files)return;
    error='';
    for(const file of Array.from(files)){
      if(picked.length>=max){error='Máximo '+max+' fotografías.';break;}
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024){
        error='Usa imágenes JPG, PNG o WebP de hasta 8 MB cada una.';continue;
      }
      picked=[...picked,{file,preview:URL.createObjectURL(file)}];
    }
    onFiles(picked.map(p=>p.file));
  }
  function remove(index:number){
    URL.revokeObjectURL(picked[index].preview);
    picked=picked.filter((_,i)=>i!==index);
    onFiles(picked.map(p=>p.file));
  }
  onDestroy(()=>picked.forEach(p=>URL.revokeObjectURL(p.preview)));
</script>
<fieldset class="rounded-2xl border border-teal-100 bg-teal-50/30 p-3 sm:p-4 space-y-3">
  <legend class="text-sm font-extrabold text-slate-800 px-2">{label}</legend>
  <p class="text-xs text-slate-500">Selecciona varias fotos a la vez. Se guardan en Cloudflare R2 al pulsar Guardar. Hasta {max} imágenes, máximo 8 MB por archivo.</p>
  <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={'Seleccionar '+label}
    class="block w-full text-xs sm:text-sm file:rounded-xl file:border-0 file:bg-teal-700 file:text-white file:font-bold file:py-2.5 file:px-4 file:mr-3"
    onchange={e=>{select(e.currentTarget.files);e.currentTarget.value='';}}/>
  {#if error}<p class="text-xs text-red-700" role="alert">{error}</p>{/if}
  {#if picked.length}
    <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {#each picked as item,i (item.preview)}
        <figure class="min-w-0 relative rounded-xl overflow-hidden border border-slate-200 bg-white">
          <img src={item.preview} alt={'Vista previa '+(i+1)} class="w-full h-24 sm:h-28 object-cover" />
          <button type="button" onclick={()=>remove(i)} aria-label={'Quitar fotografía '+(i+1)}
            class="absolute top-1 right-1 rounded-lg bg-white/95 shadow text-red-700 font-bold w-7 h-7">✕</button>
          <figcaption class="text-[10px] text-slate-500 px-2 py-1 truncate" title={item.file.name}>{item.file.name}</figcaption>
        </figure>
      {/each}
    </div>
  {/if}
</fieldset>
