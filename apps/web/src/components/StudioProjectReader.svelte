<script lang="ts">
 import { onMount } from 'svelte';
 import { apiRequest } from '../lib/api';
 let {token,project}:{token:string;project:{id:string;name:string}}=$props();
 type Section={section_id:string;audience:'technical'|'private';revision:number;updated_at:string};
 type RecordData={section_id:string;revision:number;body:Record<string,any>;updated_at:string};
 let sections=$state<Section[]>([]),selected=$state<RecordData|null>(null),latest=$state<RecordData|null>(null),title=$state(''),status=$state(''),dueDate=$state(''),name=$state(''),quantity=$state(1),unit=$state('unit'),busy=$state(false),error=$state(''),message=$state(''),pendingOperation=$state('');
 let generation=0,catalogRun=0;
 type Product={id:string;name:string;brand:string|null;model:string|null;publishedStock:number|null};
 let productId=$state<string|null>(null),catalogSearch=$state(''),catalogRows=$state<Product[]>([]),catalogBusy=$state(false),catalogError=$state(''),catalogPage=$state(1),catalogMore=$state(false),chosenProduct=$state<Product|null>(null);
 async function searchCatalog(page=1){
  const run=++catalogRun;catalogBusy=true;catalogError='';
  try{const r=await query('/api/studio/v1/catalog?'+new URLSearchParams({page:String(page),search:catalogSearch.trim()}));if(run===catalogRun){if(!Array.isArray(r.products))throw Error('Catálogo no disponible');catalogRows=r.products;catalogPage=page;catalogMore=!!r.hasMore;}}
  catch(e){if(run===catalogRun){catalogRows=[];catalogMore=false;catalogError=(e as Error).message||'No se pudo consultar el catálogo.'}}
  finally{if(run===catalogRun)catalogBusy=false}
 }
 function pickProduct(p:Product){if(busy||pendingOperation)return;chosenProduct=p;productId=p.id;}
 function clearProduct(){if(busy||pendingOperation)return;chosenProduct=null;productId=null;}
 const base=()=>'/api/studio/v1/projects/'+encodeURIComponent(project.id)+'/sections';
 const query=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'PUT',body:JSON.stringify(body)})});
 const isTask=(id:string)=>/^task-[A-Za-z0-9_-]{1,80}$/.test(id);
 const isMaterial=(id:string)=>/^material-[A-Za-z0-9_-]{1,75}$/.test(id);
 function useRecord(r:RecordData,reset=true){
   selected=r;if(reset){pendingOperation='';latest=null}
   catalogRun++;catalogBusy=false;catalogRows=[];catalogError='';catalogSearch='';catalogPage=1;catalogMore=false;chosenProduct=null;productId=typeof r.body.productId==='string'?r.body.productId:null;
   title=typeof r.body.title==='string'?r.body.title:'';
   status=typeof r.body.status==='string'?r.body.status:'pending';
   dueDate=typeof r.body.dueDate==='string'?r.body.dueDate:'';
   name=typeof r.body.name==='string'?r.body.name:'';
   quantity=typeof r.body.quantity==='number'?r.body.quantity:1;
   unit=typeof r.body.unit==='string'?r.body.unit:'unit';
 }
 async function load(){
  const run=++generation;busy=true;error='';message='';sections=[];selected=null;latest=null;
  try{const r=await query(base());if(run===generation)sections=r.sections||[]}
  catch(e){if(run===generation)error=(e as Error).message||'No se pudieron cargar las secciones.'}
  finally{if(run===generation)busy=false}
 }
 async function open(id:string){
  const run=++generation;busy=true;error='';message='';
  try{const r=await query(base()+'/'+encodeURIComponent(id));if(run===generation)useRecord(r)}
  catch(e){if(run===generation)error=(e as Error).message||'Sección no disponible.'}
  finally{if(run===generation)busy=false}
 }
 async function save(){
  if(!selected||busy||(!isTask(selected.section_id)&&!isMaterial(selected.section_id)))return;
  busy=true;error='';message='';
  try{
   const data=isTask(selected.section_id)?{title:title.trim(),status,dueDate}:{name:name.trim(),productId,quantity:Number(quantity),unit};
   if(!pendingOperation)pendingOperation=crypto.randomUUID();
   const r=await query(base()+'/'+encodeURIComponent(selected.section_id),{operationId:pendingOperation,baseRevision:selected.revision,data});
   const next={...selected,revision:r.revision,body:data};
   useRecord(next);message='Cambio confirmado por el servidor (revisión '+r.revision+').';
   sections=sections.map(s=>s.section_id===next.section_id?{...s,revision:next.revision}:s);
  }catch(e){
   const code=(e as Error&{status?:number}).status;
   if(code===409){
    error='Existe otra modificación. Tu propuesta permanece en el formulario; compara antes de decidir.';
    try{const r=await query(base()+'/'+encodeURIComponent(selected.section_id));latest=r}catch{}
   }else error=code===503?'Edición todavía no habilitada; el formulario conserva tus cambios.':(e as Error).message||'No se confirmó la modificación.';
  }finally{busy=false}
 }
 function rebase(){
  if(!latest)return;
  selected=latest;latest=null;pendingOperation='';error='';message='Revisión actualizada. Comprueba la propuesta antes de guardarla.';
  // Preserve the text and numeric values already entered in the form.
 }
 onMount(()=>{void load();return()=>{generation++;catalogRun++}});
</script>
<section class="rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label="Proyecto EV Pro Studio">
 <header><p class="text-xs uppercase tracking-widest text-teal-700 font-bold">Proyecto autorizado</p><h3 class="text-xl font-extrabold">{project.name}</h3><p class="text-sm text-slate-500">Consulta técnica y modificaciones por fila. El servidor comprueba permisos y versiones.</p></header>
 <button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={load} disabled={busy}>Actualizar secciones</button>
 {#if error}<p role="alert" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>{/if}
 {#if message}<p role="status" class="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{message}</p>{/if}
 <div class="grid gap-4 lg:grid-cols-3">
  <div class="space-y-2">
   <h4 class="font-bold">Secciones disponibles</h4>
   {#each sections as sec (sec.section_id)}
    <button type="button" disabled={busy} class="w-full text-left border rounded-lg px-3 py-2 text-sm break-all hover:bg-teal-50" onclick={()=>open(sec.section_id)}>{sec.section_id} · rev. {sec.revision}</button>
   {/each}
   {#if sections.length===0}<p class="text-sm text-slate-500">No hay secciones asignadas.</p>{/if}
  </div>
  <div class="lg:col-span-2 space-y-3">
   {#if selected}
    <h4 class="font-bold break-all">{selected.section_id} · Revisión {selected.revision}</h4>
    {#if isTask(selected.section_id)}
     <form class="space-y-2" onsubmit={e=>{e.preventDefault();void save()}}>
      <label class="block text-sm font-semibold">Tarea<input required maxlength="160" class="mt-1 block border rounded-lg p-2 w-full" bind:value={title}/></label>
      <label class="block text-sm font-semibold">Estado<select class="mt-1 block border rounded-lg p-2 w-full" bind:value={status}><option value="pending">Pendiente</option><option value="working">En ejecución</option><option value="done">Completada</option></select></label>
      <label class="block text-sm font-semibold">Fecha prevista<input type="date" class="mt-1 block border rounded-lg p-2 w-full" bind:value={dueDate}/></label>
      <button type="submit" disabled={busy} class="rounded-lg bg-teal-800 text-white px-3 py-2">Guardar tarea</button>
     </form>
    {:else if isMaterial(selected.section_id)}
     <form class="space-y-2" onsubmit={e=>{e.preventDefault();void save()}}>
      <label class="block text-sm font-semibold">Material<input required maxlength="180" class="mt-1 block border rounded-lg p-2 w-full" bind:value={name}/></label>
      <label class="block text-sm font-semibold">Cantidad técnica<input required type="number" min="0.001" max="1000000" step="any" class="mt-1 block border rounded-lg p-2 w-full" bind:value={quantity}/></label>
      <label class="block text-sm font-semibold">Unidad<select class="mt-1 block border rounded-lg p-2 w-full" bind:value={unit}>{#each ['unit','m','m2','kg','set','roll','box'] as u}<option value={u}>{u}</option>{/each}</select></label>
      <div class="border rounded-lg p-3 space-y-2">
       <p class="text-sm font-semibold">Producto del catálogo: {chosenProduct?.name||productId||'No vinculado'}</p>
       <p class="text-xs text-slate-500">Vincula una referencia publicada sin reservar existencias ni modificar precios.</p>
       <div class="flex flex-wrap gap-2"><input aria-label="Buscar producto de catálogo" type="search" maxlength="100" class="flex-1 min-w-0 border rounded p-2" bind:value={catalogSearch}/><button type="button" class="border rounded px-3 py-2" disabled={busy||catalogBusy||!!pendingOperation} onclick={()=>searchCatalog(1)}>Buscar</button><button type="button" class="border rounded px-3 py-2" disabled={busy||!!pendingOperation||!productId} onclick={clearProduct}>Quitar vínculo</button></div>
       {#if catalogError}<p role="alert" class="text-sm">{catalogError}</p>{/if}
       {#each catalogRows as p (p.id)}<div class="border-t pt-2 flex items-center justify-between gap-2"><span class="text-sm">{p.name} · {p.brand||''} {p.model||''}</span><button type="button" class="border rounded px-2 py-1" disabled={busy||!!pendingOperation} onclick={()=>pickProduct(p)}>Vincular</button></div>{/each}
       <div class="flex gap-2"><button type="button" disabled={catalogBusy||catalogPage===1} onclick={()=>searchCatalog(catalogPage-1)}>Anterior</button><button type="button" disabled={catalogBusy||!catalogMore} onclick={()=>searchCatalog(catalogPage+1)}>Siguiente</button></div>
      </div>
      <button type="submit" disabled={busy} class="rounded-lg bg-teal-800 text-white px-3 py-2">Guardar material</button>
     </form>
    {:else}<pre class="text-xs border rounded-lg p-3 bg-slate-50 whitespace-pre-wrap break-all">{JSON.stringify(selected.body,null,2)}</pre><p class="text-xs text-slate-500">La sección está disponible en modo consulta. Su editor especializado continúa pendiente.</p>{/if}
    {#if latest}<div class="border rounded-lg p-3 space-y-2"><p class="font-semibold">Versión actual del servidor · revisión {latest.revision}</p><pre class="text-xs whitespace-pre-wrap break-all">{JSON.stringify(latest.body,null,2)}</pre><button type="button" class="rounded-lg border px-3 py-2 text-sm" onclick={rebase}>Usar revisión actual, conservando mi propuesta</button></div>{/if}
   {:else}<p class="text-sm text-slate-500">Selecciona una sección del proyecto.</p>{/if}
  </div>
 </div>
</section>
