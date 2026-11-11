<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let { token, onUpdate }: {token:string;onUpdate:()=>Promise<void>}=$props();
  type Cat={id:string;name:string;is_active:number|boolean;sort_order:number};
  let categories:Cat[]=$state([]);
  let editing:Cat|null=$state(null),open=$state(false),busy=$state(false);
  let name=$state(''),active=$state(true),order=$state(0),error=$state(''),message=$state('');
  async function load(){
    try{categories=(await api.listAdminGalleryCategories(token)).categories||[];}
    catch(e){error=e instanceof Error?e.message:'No se pudieron cargar las categorías';}
  }
  onMount(()=>{void load();});
  function create(){editing=null;name='';active=true;order=categories.length;open=true;error='';}
  function edit(cat:Cat){editing=cat;name=cat.name;active=Boolean(cat.is_active);order=cat.sort_order||0;open=true;error='';}
  async function save(event:SubmitEvent){
    event.preventDefault();busy=true;error='';message='';
    try{
      if(editing)await api.updateAdminGalleryCategory(token,editing.id,{name,is_active:active,sort_order:order});
      else await api.createAdminGalleryCategory(token,name);
      open=false;message=editing?'Categoría actualizada.':'Categoría creada.';
      await load();await onUpdate();
    }catch(e){error=e instanceof Error?e.message:'No se pudo guardar';}
    finally{busy=false;}
  }
  async function remove(cat:Cat){
    if(!confirm('¿Eliminar «'+cat.name+'»? No se podrán eliminar categorías que tengan proyectos.'))return;
    busy=true;error='';
    try{await api.deleteAdminGalleryCategory(token,cat.id);message='Categoría eliminada.';await load();await onUpdate();}
    catch(e){error=e instanceof Error?e.message:'No se pudo eliminar';}
    finally{busy=false;}
  }
</script>
<section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3" aria-label="Categorías de proyectos">
  <header class="flex flex-wrap justify-between gap-3 items-center">
    <div><h3 class="font-extrabold text-slate-900">Categorías de proyectos ({categories.length})</h3>
      <p class="text-xs text-slate-500 mt-1">Ej. Residencial, empresarial, mantenimiento. Son independientes de las categorías de equipos.</p>
    </div>
    <button type="button" onclick={create} class="rounded-xl bg-teal-700 text-white px-4 py-2.5 text-xs font-bold">+ Categoría</button>
  </header>
  {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
  {#if message}<p role="status" class="text-sm text-emerald-700">{message}</p>{/if}
  <div class="flex flex-wrap gap-2">
    {#each categories as cat (cat.id)}
      <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl pl-3 pr-1 py-1.5">
        <span class="text-xs font-semibold text-slate-800">{cat.name}</span>
        {#if !cat.is_active}<span class="text-[10px] text-slate-400">Oculta</span>{/if}
        <button type="button" onclick={()=>edit(cat)} class="rounded-lg bg-teal-50 text-teal-800 px-2.5 py-1.5 text-xs font-bold">Editar</button>
        <button type="button" disabled={busy} onclick={()=>remove(cat)} aria-label={'Eliminar '+cat.name} class="rounded-lg text-red-700 px-2 py-1.5 text-xs">✕</button>
      </div>
    {/each}
    {#if !categories.length}<p class="text-sm text-slate-500">Crea tu primera categoría para organizar la galería.</p>{/if}
  </div>
</section>
{#if open}
  <div class="fixed inset-0 z-[190] bg-slate-950/70 flex items-center justify-center p-3">
    <dialog open aria-label="Editar categoría de proyecto" class="relative m-0 bg-white rounded-3xl shadow-2xl p-5 sm:p-7 w-full max-w-lg">
      <div class="flex justify-between gap-3 mb-5"><h2 class="text-xl font-extrabold text-slate-900">{editing?'Editar categoría':'Crear categoría'}</h2>
        <button type="button" aria-label="Cerrar" onclick={()=>open=false} class="font-bold">✕</button>
      </div>
      <form class="space-y-4" onsubmit={save}>
        <label class="block text-sm font-semibold text-slate-700">Nombre
          <input required minlength="2" maxlength="100" bind:value={name} class="block w-full mt-2 border border-slate-300 rounded-xl p-3" placeholder="Ej. Instalaciones empresariales"/>
        </label>
        {#if editing}
          <label class="block text-sm font-semibold text-slate-700">Orden
            <input type="number" min="0" max="9999" bind:value={order} class="block w-full mt-2 border border-slate-300 rounded-xl p-3"/>
          </label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={active}/> Visible al público</label>
        {/if}
        {#if error}<p role="alert" class="text-red-700 text-sm">{error}</p>{/if}
        <button disabled={busy} class="w-full rounded-xl bg-teal-700 text-white font-bold py-3">{busy?'Guardando…':'Guardar categoría'}</button>
      </form>
    </dialog>
  </div>
{/if}
