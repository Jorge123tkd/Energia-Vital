<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  let { token }: { token: string } = $props();
  type Category = { id:string;name:string;legacy_type:string;requires_image:number|boolean;is_active:number|boolean;sort_order:number };
  let categories:Category[]=$state([]);
  let editing:Category|null=$state(null);
  let name=$state(''),legacy=$state('consultation'),required=$state(false),active=$state(true),sort=$state(0);
  let open=$state(false),busy=$state(false),error=$state(''),notice=$state('');
  const legacyLabels=[
    {id:'consultation',label:'Consulta general'},{id:'installation',label:'Instalación'},
    {id:'repair',label:'Reparación'},{id:'maintenance',label:'Mantenimiento'},
    {id:'complaint',label:'Reclamación'},{id:'suggestion',label:'Sugerencia'},
  ];
  async function load(){
    error='';
    try{categories=(await api.listAdminRequestCategories(token)).categories||[];}
    catch(e){error=e instanceof Error?e.message:'No se pudieron cargar las categorías';}
  }
  onMount(()=>{void load();});
  function add(){editing=null;name='';legacy='consultation';required=false;active=true;sort=categories.length;open=true;error='';}
  function edit(cat:Category){editing=cat;name=cat.name;legacy=cat.legacy_type;required=Boolean(cat.requires_image);
    active=Boolean(cat.is_active);sort=cat.sort_order||0;open=true;error='';}
  async function save(event:SubmitEvent){
    event.preventDefault();busy=true;error='';notice='';
    try{
      const body={name:name.trim(),legacy_type:legacy,requires_image:required,is_active:active,sort_order:sort};
      if(editing)await api.updateAdminRequestCategory(token,editing.id,body);
      else await api.createAdminRequestCategory(token,body);
      open=false;notice=editing?'Tipo actualizado.':'Tipo de solicitud creado.';
      await load();
    }catch(e){error=e instanceof Error?e.message:'No se pudo guardar';}
    finally{busy=false;}
  }
  async function remove(cat:Category){
    if(!confirm('¿Eliminar «'+cat.name+'»? Las categorías con solicitudes existentes no se pueden borrar.'))return;
    busy=true;error='';
    try{await api.deleteAdminRequestCategory(token,cat.id);notice='Categoría eliminada.';await load();}
    catch(e){error=e instanceof Error?e.message:'No se pudo eliminar';}
    finally{busy=false;}
  }
</script>

<section class="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div><h2 class="text-lg font-extrabold text-slate-900">Tipos de solicitud ({categories.length})</h2>
      <p class="text-sm text-slate-500 mt-1">Añade, cambia el nombre, reordena u oculta los tipos que ven los clientes. No se borra el historial.</p>
    </div>
    <button type="button" class="rounded-xl bg-teal-700 text-white font-bold px-4 py-2.5 text-sm" onclick={add}>+ Nuevo tipo</button>
  </header>
  {#if error}<p role="alert" class="rounded-xl bg-red-50 text-red-800 p-3 text-sm">{error}</p>{/if}
  {#if notice}<p role="status" class="rounded-xl bg-emerald-50 text-emerald-800 p-3 text-sm">{notice}</p>{/if}
  <div class="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
    {#each categories as cat (cat.id)}
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div><strong class="text-sm text-slate-900">{cat.name}</strong>
          <p class="text-xs text-slate-500 mt-1">{legacyLabels.find(t=>t.id===cat.legacy_type)?.label||'Consulta'} · Orden {cat.sort_order}</p>
          <p class="text-xs mt-1 {cat.is_active?'text-emerald-700':'text-orange-700'}">{cat.is_active?'Visible':'Oculta'}{cat.requires_image?' · Requiere foto':''}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="flex-1 rounded-lg bg-white border border-teal-200 text-teal-700 text-xs font-bold px-3 py-2" onclick={()=>edit(cat)}>Editar</button>
          <button type="button" disabled={busy} class="rounded-lg bg-white border border-red-200 text-red-700 text-xs font-bold px-3 py-2" onclick={()=>remove(cat)}>Eliminar</button>
        </div>
      </article>
    {/each}
  </div>
</section>
{#if open}
  <div class="fixed inset-0 z-[180] bg-slate-950/70 p-4 flex items-center justify-center">
    <dialog open class="relative m-0 bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-7 shadow-2xl" aria-label="Editar tipo de solicitud">
      <header class="flex justify-between items-start gap-3 mb-5"><div>
        <h2 class="font-extrabold text-xl text-slate-900">{editing?'Editar tipo':'Nuevo tipo de solicitud'}</h2>
        <p class="text-xs text-slate-500 mt-1">La clasificación operativa conserva las compatibilidades con las solicitudes anteriores.</p>
      </div><button type="button" onclick={()=>open=false} aria-label="Cerrar" class="text-xl text-slate-600">✕</button></header>
      <form onsubmit={save} class="space-y-4">
        <label class="block text-sm font-semibold text-slate-700">Nombre visible
          <input required minlength="2" maxlength="100" bind:value={name} class="rq-control" />
        </label>
        <label class="block text-sm font-semibold text-slate-700">Clasificación operativa
          <select bind:value={legacy} class="rq-control">
            {#each legacyLabels as item}<option value={item.id}>{item.label}</option>{/each}
          </select>
        </label>
        <label class="block text-sm font-semibold text-slate-700">Orden
          <input type="number" min="0" max="9999" step="1" bind:value={sort} class="rq-control" />
        </label>
        <label class="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" bind:checked={required}/> Pedir foto del equipo al cliente</label>
        {#if editing}<label class="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" bind:checked={active}/> Mostrar tipo de solicitud</label>{/if}
        {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
        <button disabled={busy} class="w-full rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold py-3">{busy?'Guardando…':'Guardar tipo de solicitud'}</button>
      </form>
    </dialog>
  </div>
{/if}
<style>
  .rq-control{display:block;width:100%;padding:.75rem;margin-top:.4rem;border:1px solid #cbd5e1;border-radius:.8rem;background:#fff;color:#0f172a}
  .rq-control:focus-visible{outline:2px solid #0f766e}
</style>
