<script lang="ts">
 import { onMount } from 'svelte';
 import { apiRequest } from '../lib/api';
 let {token,projects}:{token:string;projects:{id:string;name:string}[]}=$props();
 type Proposal={id:string;project_id:string;kind:'catalog'|'gallery';title:string;summary:string;source_section_id:string|null;consent_reference:string|null;status:string;created_by:string};
 let proposals=$state<Proposal[]>([]),project=$state(''),kind=$state<'catalog'|'gallery'>('catalog'),title=$state(''),summary=$state(''),source=$state(''),consent=$state(''),reviewId=$state(''),reviewNote=$state(''),next=$state<string|null>(null),pendingId=$state(''),busy=$state(false),error=$state(''),message=$state('');
 let generation=0,materialGeneration=0;
 let materials=$state<{id:string;name:string}[]>([]),materialLoading=$state(false),materialError=$state('');
 const api=(path:string,body?:unknown)=>apiRequest('/api/studio/v1/'+path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 async function load(more=false){
  const run=++generation;busy=true;error='';message='';
  try{
   const search=new URLSearchParams();
   if(project)search.set('project',project);
   if(more&&next)search.set('after',next);
   const r=await api('publication-proposals'+(search.size?'?'+search:''));
   if(run!==generation)return;
   const page=Array.isArray(r.proposals)?r.proposals:[];
   proposals=more?[...proposals,...page]:page;
   next=r.next||null;
  }catch(e){if(run===generation){if(!more)proposals=[];next=null;error=(e as Error&{status?:number}).status===503?'Propuestas todavía no habilitadas.':(e as Error).message||'No se pudo consultar.'}}
  finally{if(run===generation)busy=false}
 }
 async function loadMaterials(){
  const run=++materialGeneration;materials=[];source='';materialError='';materialLoading=false;
  if(!project||kind!=='catalog')return;
  materialLoading=true;
  try{
   const target='projects/'+encodeURIComponent(project)+'/sections';
   const r=await api(target);
   if(!Array.isArray(r.sections))throw Error('No se pudieron consultar los materiales compartidos.');
   const rows=r.sections.filter((s:any)=>/^material-[A-Za-z0-9_-]{1,75}$/.test(s.section_id));
   const eligible:{id:string;name:string}[]=[];
   for(let i=0;i<rows.length;i+=8){
    if(run!==materialGeneration)return;
    const batch=await Promise.all(rows.slice(i,i+8).map((s:any)=>api(target+'/'+encodeURIComponent(s.section_id))));
    for(const s of batch)if(s.body?.productId===null&&typeof s.body.name==='string')eligible.push({id:s.section_id,name:s.body.name});
   }
   if(run===materialGeneration)materials=eligible.sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }catch(e){if(run===materialGeneration)materialError=(e as Error).message||'No se pudieron consultar los materiales.'}
  finally{if(run===materialGeneration)materialLoading=false}
 }
 async function create(){
  if(busy)return;busy=true;error='';message='';
  try{
   if(!project)throw Error('Selecciona un proyecto autorizado.');
   if(kind==='catalog'&&!materials.some(m=>m.id===source))throw Error('Selecciona un material compartido sin producto publicado.');
   if(kind==='gallery'&&consent.trim().length<12)throw Error('Identifica el documento de consentimiento antes de crear la sugerencia.');
   if(!pendingId)pendingId=crypto.randomUUID();
   await api('publication-proposals',{id:pendingId,projectId:project,kind,sourceSectionId:kind==='catalog'?source.trim():null,title:title.trim(),summary:summary.trim(),consentReference:kind==='gallery'?consent.trim():null});
   pendingId='';title='';summary='';source='';consent='';message='Sugerencia guardada para revisión interna. No se ha publicado nada.';
   // Avoid stale older listing if the new entry appeared asynchronously.
   const r=await api('publication-proposals'+(project?'?project='+encodeURIComponent(project):''));
   proposals=r.proposals??[];next=r.next||null;
  }catch(e){error=(e as Error&{status?:number}).status===503?'El flujo comercial aún no está habilitado.':(e as Error).message||'No se confirmó la propuesta. Reintenta con el mismo formulario.'}
  finally{busy=false}
 }
 async function decide(id:string,decision:'accept'|'reject'){
  if(busy)return;busy=true;error='';message='';
  try{
   if(reviewNote.trim().length<8)throw Error('Escribe un motivo de al menos ocho caracteres.');
   await api('admin/publication-proposals/'+encodeURIComponent(id)+'/decision',{decision,note:reviewNote.trim()});
   reviewId='';reviewNote='';
   message=decision==='accept'?'Aceptada para evaluación comercial; aún no se publica.':'Sugerencia rechazada y conservada en el historial.';
   const r=await api('publication-proposals'+(project?'?project='+encodeURIComponent(project):''));proposals=r.proposals??[];next=r.next||null;
  }catch(e){error=(e as Error&{status?:number}).status===503?'Revisión todavía no habilitada.':(e as Error).message||'Decisión no confirmada.'}
  finally{busy=false}
 }
 onMount(()=>{void load();return()=>{generation++;materialGeneration++}});
</script>
<section class="space-y-4" aria-label="Sugerencias comerciales">
 <div><h4 class="text-lg font-extrabold">Sugerencias de catálogo y galería</h4><p class="text-sm text-slate-500">Solo propuestas internas. Ni la aprobación ni el consentimiento registrado publican imágenes, productos, precios o datos del cliente.</p></div>
 <label class="text-sm font-semibold block">Proyecto
  <select class="block w-full border rounded-lg p-2 mt-1" value={project} disabled={busy||materialLoading} onchange={e=>{project=e.currentTarget.value;pendingId='';void load();void loadMaterials()}}>
   <option value="">Todos los proyectos / seleccionar para proponer</option>{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
  </select>
 </label>
 <form class="space-y-3 border rounded-xl p-4" onsubmit={e=>{e.preventDefault();void create()}}>
  <label class="block text-sm font-semibold">Tipo<select class="block w-full border rounded-lg p-2 mt-1" bind:value={kind} disabled={busy} onchange={()=>{pendingId='';void loadMaterials()}}><option value="catalog">Artículo para catálogo</option><option value="gallery">Proyecto para galería</option></select></label>
  <label class="block text-sm font-semibold">Título<input required minlength="3" maxlength="160" class="block w-full border rounded-lg p-2 mt-1" bind:value={title}/></label>
  <label class="block text-sm font-semibold">Descripción interna<textarea maxlength="600" rows="3" class="block w-full border rounded-lg p-2 mt-1" bind:value={summary}></textarea></label>
  {#if kind==='catalog'}<label class="block text-sm font-semibold">Material técnico sin producto publicado<select required disabled={busy||materialLoading||!materials.length} class="block w-full border rounded-lg p-2 mt-1" bind:value={source}><option value="">Seleccionar material</option>{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
  {#if materialLoading}<p role="status" class="text-sm">Consultando materiales compartidos…</p>{:else if materialError}<p role="alert" class="text-sm text-amber-900">{materialError}</p>{:else if project&&!materials.length}<p class="text-sm text-slate-600">No hay materiales elegibles. Comparte primero los materiales desde Colaboración y permisos.</p>{/if}
  <button type="button" disabled={!project||busy||materialLoading} class="text-sm underline" onclick={loadMaterials}>Actualizar materiales</button>
  {:else}<label class="block text-sm font-semibold">Referencia del consentimiento documentado<input required minlength="12" maxlength="200" placeholder="Documento firmado o autorización verificable" class="block w-full border rounded-lg p-2 mt-1" bind:value={consent}/></label>{/if}
  <button type="submit" disabled={busy||!project||(kind==='catalog'&&(materialLoading||!source||!!materialError))} class="rounded-lg bg-teal-800 text-white font-semibold px-4 py-2">Guardar sugerencia interna</button>
 </form>
 {#if error}<p role="alert" class="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">{error}</p>{/if}
 {#if message}<p role="status" class="rounded-lg bg-teal-50 text-teal-900 p-3 text-sm">{message}</p>{/if}
 <button type="button" class="border rounded-lg p-2 text-sm" disabled={busy} onclick={()=>load()}>Actualizar sugerencias</button>
 {#each proposals as p (p.id)}
  <article class="border rounded-xl p-3 space-y-2 text-sm break-words">
   <p class="font-bold">{p.title} · {p.kind==='catalog'?'Catálogo':'Galería'}</p>
   <p>{p.summary}</p><p class="text-xs text-slate-500">Proyecto {p.project_id} · Estado {p.status} · Creado por {p.created_by}</p>
   {#if p.status==='suggested'}
    <button type="button" class="border rounded-lg px-3 py-2" disabled={busy} onclick={()=>{reviewId=p.id;reviewNote=''}}>Revisar</button>
    {#if reviewId===p.id}
     <label class="block font-semibold">Motivo de decisión<textarea required minlength="8" rows="2" class="block w-full border rounded-lg p-2 mt-1" bind:value={reviewNote}></textarea></label>
     <div class="flex gap-2 flex-wrap"><button type="button" disabled={busy} class="bg-teal-800 text-white rounded-lg px-3 py-2" onclick={()=>decide(p.id,'accept')}>Aceptar para evaluación</button><button type="button" disabled={busy} class="border rounded-lg px-3 py-2" onclick={()=>decide(p.id,'reject')}>Rechazar</button></div>
    {/if}
   {/if}
  </article>
 {/each}
 {#if next}<button type="button" class="text-teal-800 underline" disabled={busy} onclick={()=>load(true)}>Cargar más</button>{/if}
</section>
