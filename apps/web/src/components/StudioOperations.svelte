<script lang="ts">
 import { onMount } from 'svelte';
 import { apiRequest } from '../lib/api';
 import StudioPublication from './StudioPublication.svelte';
 import StudioCommercialActions from './StudioCommercialActions.svelte';
 let {token,projects,initialMode='inventory',embedded=false,procurementGroup=false}: {token:string;projects:{id:string;name:string}[];initialMode?:Mode;embedded?:boolean;procurementGroup?:boolean}=$props();
 type Mode='inventory'|'orders'|'suppliers'|'finance'|'shortages'|'conflicts'|'backup'|'publication';
 let mode=$state<Mode>(initialMode),project=$state(''),busy=$state(false),error=$state(''),rows=$state<Record<string,any>[]>([]),cursor=$state<string|null>(null),loaded=$state(false),backupId=$state(''),receipt=$state<any>(null);
 let generation=0;
 let reviewSeq=$state<number|null>(null),reviewRevision=$state<number|null>(null),central=$state<any>(null),merged=$state('');
 const tabs:{key:Mode;name:string}[]=[{key:'inventory',name:'Almacén'},{key:'orders',name:'Compras'},{key:'suppliers',name:'Proveedores'},{key:'finance',name:'Economía'},{key:'shortages',name:'Faltantes'},{key:'conflicts',name:'Conflictos'},{key:'backup',name:'Respaldos'},{key:'publication',name:'Publicaciones'}];
 const query=(path:string,body?:unknown)=>apiRequest(path,{headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
 const money=(v:unknown,c:string)=>typeof v==='number'?new Intl.NumberFormat('es',{style:'currency',currency:c}).format(v/100):'—';
 const qty=(v:unknown)=>typeof v==='number'?new Intl.NumberFormat('es',{maximumFractionDigits:3}).format(v/1000):'—';
 async function load(more=false){
  const run=++generation;busy=true;error='';if(!more){rows=[];cursor=null;receipt=null;loaded=false}
  try{
   const after=more&&cursor?'?after='+encodeURIComponent(cursor):'';
   let data:any,key='';
   if(mode==='inventory'){data=await query('/api/warehouse/items'+after);key='items'}
   else if(mode==='orders'){data=await query('/api/warehouse/procurement/orders'+after);key='orders'}
   else if(mode==='suppliers'){data=await query('/api/warehouse/procurement/suppliers'+after);key='suppliers'}
   else if(mode==='conflicts'){data=await query('/api/studio/v1/admin/conflicts'+after);key='conflicts'}
   else if(mode==='finance'||mode==='shortages'){
    if(!project)return;
    if(mode==='finance'){data=await query('/api/business-finance/projects/'+encodeURIComponent(project));if(run===generation)receipt=data}
    else{data=await query('/api/warehouse/procurement/shortages/'+encodeURIComponent(project)+after);key='requirements'}
   }else return;
   if(run!==generation)return;
   if(key){const page=Array.isArray(data[key])?data[key]:[];rows=more?[...rows,...page]:page;cursor=data.next==null?null:String(data.next)}
   loaded=true;
  }catch(e){if(run===generation){if(!more){rows=[];receipt=null;cursor=null;}error=(e as Error&{status?:number}).status===503?((e as Error).message||'Función aún no habilitada en el servidor.')+' · No se han modificado existencias ni datos financieros.':(e as Error).message||'No se pudo consultar.'}}
  finally{if(run===generation)busy=false}
 }
 async function inspect(r:any){
  const run=++generation;busy=true;error='';reviewSeq=null;central=null;reviewRevision=null;merged='';
  try{const live=await query('/api/studio/v1/projects/'+encodeURIComponent(r.project_id)+'/sections/'+encodeURIComponent(r.section_id));if(run!==generation)return;reviewSeq=r.seq;reviewRevision=live.revision;central=live.body;merged=JSON.stringify(live.body,null,2)}catch(e){if(run===generation)error=(e as Error).message||'No se pudo consultar la versión vigente.'}finally{if(run===generation)busy=false}
 }
 async function decide(choice:'remote'|'local'|'merge'){
  if(busy||reviewSeq==null||reviewRevision==null)return;
  const run=++generation;busy=true;error='';
  try{const data=choice==='merge'?JSON.parse(merged):undefined;await query('/api/studio/v1/admin/conflicts/'+reviewSeq+'/resolve',{choice,expectedRevision:reviewRevision,operationId:crypto.randomUUID(),...(data===undefined?{}:{data})});if(run===generation){reviewSeq=null;central=null;reviewRevision=null;await load()}}catch(e){if(run===generation){error=(e as Error).message||'Decisión no confirmada. Vuelve a consultar.';reviewSeq=null;central=null;reviewRevision=null}}finally{if(run===generation)busy=false}
 }
 function select(m:Mode){reviewSeq=null;central=null;reviewRevision=null;generation++;busy=false;mode=m;rows=[];cursor=null;receipt=null;error='';loaded=false;if(!['finance','shortages','backup','publication'].includes(m)||(project&&['finance','shortages'].includes(m)))void load()}
 function selectProject(p:string){generation++;busy=false;project=p;rows=[];receipt=null;cursor=null;loaded=false;error='';backupId='';if(p&&['finance','shortages'].includes(mode))void load()}
 async function backup(create:boolean){
  if(!project||busy)return;
  const run=++generation;busy=true;error='';receipt=null;
  try{
    const chosen=create?crypto.randomUUID():backupId.trim();
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(chosen))throw Error('Identificador de respaldo inválido.');
    if(create)backupId=chosen;
    const path='/api/studio/v1/admin/projects/'+encodeURIComponent(project)+'/backups/'+encodeURIComponent(chosen);
    const data=await query(path+(create?'':'/preview'),create?{}:undefined);
    if(run===generation)receipt=data;
  }catch(e){if(run===generation)error=(e as Error&{status?:number}).status===503?'Respaldos aún no habilitados.':(e as Error).message||'No se pudo confirmar el respaldo.'}
  finally{if(run===generation)busy=false}
 }
 onMount(()=>{void load();return()=>{generation++;};});
</script>
<section class="rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label="Operaciones empresariales">
 <header><p class="uppercase tracking-widest text-xs text-teal-700 font-bold">Administración autorizada</p><h3 class="text-xl font-extrabold">{mode==='conflicts'?'Revisión de conflictos':mode==='backup'?'Copias de secciones compartidas':mode==='finance'?'Obligaciones y compromisos reales':tabs.find(t=>t.key===mode)?.name||'Operaciones empresariales'}</h3><p class="text-sm text-slate-500">{mode==='finance'?'Información comercial registrada, distinta del presupuesto estimado del expediente.':mode==='inventory'?'Existencias físicas y reservas, distintas del listado de materiales del diseño.':mode==='backup'?'Copias de secciones compartidas, no sustituyen el respaldo general de ingeniería.':'Consultas en línea sujetas a permisos y habilitación del servidor.'}</p></header>
 {#if !embedded||procurementGroup}<div class="flex gap-2 flex-wrap">{#each (procurementGroup?tabs.filter(t=>['inventory','orders','suppliers','shortages'].includes(t.key)):tabs) as t}<button type="button" aria-pressed={mode===t.key} class={mode===t.key?'rounded-lg bg-teal-800 text-white px-3 py-2 text-sm font-semibold':'rounded-lg border px-3 py-2 text-sm'} disabled={busy} onclick={()=>select(t.key)}>{t.name}</button>{/each}</div>{/if}
 {#if mode==='publication'}
  <StudioPublication {token} {projects}/>
 {:else}
 {#if ['finance','shortages','backup'].includes(mode)}
  <label class="block text-sm font-bold">Proyecto<select class="mt-2 w-full rounded-lg border p-2 font-normal" value={project} disabled={busy} onchange={e=>selectProject(e.currentTarget.value)}><option value="">Seleccionar proyecto</option>{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label>
 {/if}
 {#if ['finance','shortages','inventory','orders','suppliers'].includes(mode)}
  {#key mode+'|'+project}<StudioCommercialActions {token} {mode} {project} {projects} onSaved={()=>load()}/>{/key}
 {/if}
 {#if mode==='backup'}
  <p class="text-sm text-slate-500">Uso administrativo: respaldo de tareas y materiales que comparten los trabajadores. Para conservar todos tus proyectos utiliza Respaldos generales. Copia cifrada de secciones y metadatos. No incluye los archivos adjuntos ni sustituye la copia integral. La vista previa nunca restaura automáticamente.</p>
  <div class="flex flex-wrap gap-2"><button type="button" class="rounded-lg bg-teal-800 text-white px-3 py-2" disabled={!project||busy} onclick={()=>backup(true)}>Crear respaldo</button><input class="rounded-lg border p-2 min-w-0 flex-1" aria-label="Identificador de respaldo" placeholder="Identificador del respaldo" maxlength="100" bind:value={backupId}/><button type="button" class="rounded-lg border px-3 py-2" disabled={!project||!backupId||busy} onclick={()=>backup(false)}>Comparar</button></div>
 {:else}
  <button type="button" class="rounded-lg border px-3 py-2 text-sm" disabled={busy||(['finance','shortages'].includes(mode)&&!project)} onclick={()=>load()}>{busy?'Consultando…':'Actualizar datos'}</button>
 {/if}
 {#if error}<p role="alert" class="rounded-lg bg-amber-50 text-amber-900 border border-amber-200 p-3 text-sm">{error}</p>{/if}
 {#if busy}<p role="status" class="text-sm text-slate-500">Consultando servidor central…</p>{/if}
 {#if loaded&&!rows.length&&!receipt&&!busy}<p class="text-sm text-slate-500">No hay registros disponibles.</p>{/if}
 {#each rows as r}
   <article class="border rounded-xl p-3 space-y-1 text-sm break-words">
   {#if mode==='inventory'}<p class="font-bold">{r.name}</p><p>Físico: {qty(r.on_hand_milli)} {r.unit} · Libre: {qty(r.available_milli)} · Reservado: {qty(r.reserved_milli)} · Entregado: {qty(r.issued_milli)}</p>
   {:else if mode==='orders'}<p class="font-bold">{r.reference} · {r.supplier_name}</p><p>{r.status} · {r.incoterm} · {money(r.total_minor,r.currency)}</p>
   {:else if mode==='suppliers'}<p class="font-bold">{r.name}</p><p>{r.country} · {r.active?'Activo':'Inactivo'}</p><p>{r.contact||'Sin contacto registrado'}</p>
   {:else if mode==='shortages'}<p class="font-bold">{r.name}</p><p>Necesidad: {qty(r.required_milli)} · Sin cubrir: {qty(r.uncovered_milli)} · Disponible compartido: {qty(r.shared_available_milli)} · Por recibir: {qty(r.ordered_not_received_milli)} {r.unit}</p>
   {:else if mode==='conflicts'}<p class="font-bold">{r.project_id} · {r.section_id}</p><p>Revisión base {r.base_revision} / central {r.remote_revision}</p><div class="grid gap-2 md:grid-cols-2"><div><p class="font-semibold">Propuesta</p><pre class="text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.proposed,null,2)}</pre></div><div><p class="font-semibold">Versión al detectar conflicto</p><pre class="text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.remote_body,null,2)}</pre></div></div><button type="button" class="rounded-lg border px-3 py-2" disabled={busy} onclick={()=>inspect(r)}>Consultar versión vigente y revisar</button>{#if reviewSeq===r.seq}<div class="border-t space-y-2 pt-3"><p class="font-semibold">Versión vigente · revisión {reviewRevision}</p><pre class="text-xs whitespace-pre-wrap break-all">{JSON.stringify(central,null,2)}</pre><label class="block">Contenido combinado<textarea class="block w-full rounded-lg border p-2 font-mono text-xs" rows="5" bind:value={merged}></textarea></label><div class="flex flex-wrap gap-2"><button type="button" disabled={busy} onclick={()=>decide('remote')} class="rounded-lg border px-3 py-2">Conservar central</button><button type="button" disabled={busy} onclick={()=>decide('local')} class="rounded-lg border px-3 py-2">Aceptar propuesta</button><button type="button" disabled={busy} onclick={()=>decide('merge')} class="rounded-lg bg-teal-800 text-white px-3 py-2">Confirmar combinación</button></div></div>{/if}
   {/if}</article>
 {/each}
 {#if cursor}<button type="button" disabled={busy} class="text-teal-800 underline text-sm" onclick={()=>load(true)}>Cargar más</button>{/if}
 {#if receipt&&mode==='finance'}
  {#if receipt.receivable}<div class="grid gap-2 sm:grid-cols-3">{#each [{name:'Contratado',value:receipt.receivable.contracted_usd_cents},{name:'Verificado manualmente',value:receipt.receivable.manually_verified_usd_cents},{name:'Pendiente de referencia',value:receipt.receivable.outstanding_reference_usd_cents}] as metric}<div class="rounded-xl bg-slate-50 p-4"><p class="text-xs text-slate-500">{metric.name}</p><p class="font-bold text-xl">{money(metric.value,'USD')}</p></div>{/each}</div>{:else}<p class="text-sm">No consta contrato aceptado.</p>{/if}
  <h4 class="font-bold">Obligaciones documentadas</h4>{#each receipt.obligations||[] as o}<p class="border-t py-2 text-sm">{o.category} · {money(o.documented_minor,o.currency)} · Pendiente {money(o.outstanding_minor,o.currency)}</p>{/each}
  <h4 class="font-bold">Compromisos sin factura</h4>{#each receipt.uninvoicedCommitments||[] as o}<p class="text-sm">{money(o.uninvoiced_committed_minor,o.currency)}</p>{/each}<p class="text-xs text-slate-500">Monedas separadas. No constituye conciliación bancaria ni utilidad contable.</p>
 {:else if receipt&&mode==='backup'}<p role="status" class="rounded-lg bg-teal-50 text-teal-900 p-3">Respaldo {receipt.backup} · {receipt.sections} secciones · {receipt.assetReferences} referencias de archivos.</p>{#each receipt.differences||[] as d}<p class="border-t py-2 text-sm">{d.section} · {d.state} · respaldo {d.backupRevision??'—'} / central {d.centralRevision??'—'}</p>{/each}
 {/if}
{/if}
 </section>
