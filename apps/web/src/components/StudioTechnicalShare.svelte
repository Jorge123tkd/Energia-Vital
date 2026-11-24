<script lang="ts">
 import {apiRequest,ADMIN_TOKEN_KEY} from '../lib/api';
 import {savedProjects,previewTechnicalRows,reviewTeamChanges,applyTeamChanges,type TeamChange} from '../lib/studio-technical-share.js';
 let {token,projects,onRefresh}:{token:string;projects:{id:string;name:string}[];onRefresh:()=>Promise<void>}=$props();
 type Project={id:string;name:string};
 type Row={id:string;site:string;kind:string;body:{title?:string;name?:string;quantity?:number;unit?:string;status?:string;dueDate?:string;productId?:null}};
 type Skip={site:string;kind:string;reason:string};
 let source=$state<any>(null),available=$state<Project[]>([]),selected=$state(''),rows=$state<Row[]>([]),skipped=$state<Skip[]>([]),checked=$state<string[]>([]),existing=$state<string[]>([]),reviewed=$state(false),busy=$state(false),error=$state(''),message=$state(''),rev=$state('');
 let changes=$state<TeamChange[]>([]),approved=$state<string[]>([]),acceptReview=$state(false);
 function call(path:string,method='GET',body?:unknown){
  if(!token||sessionStorage.getItem(ADMIN_TOKEN_KEY)!==token)throw Error('Sesión cambiada. Abre Studio nuevamente.');
  return apiRequest('/api/studio/v1/'+path,{method,headers:{Authorization:'Bearer '+token},cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
 }
 async function load(){
  if(busy)return;busy=true;error='';message='';source=null;available=[];selected='';rows=[];checked=[];skipped=[];reviewed=false;existing=[];changes=[];approved=[];acceptReview=false;
  try{const saved=await call('engineering/manifest');source=saved.snapshot;rev=saved.rev;available=savedProjects(source)}
  catch(e){error=(e as Error).message||'No se pudo consultar ingeniería guardada.'}
  finally{busy=false}
 }
 async function preview(){
  if(busy||!selected)return;busy=true;error='';message='';rows=[];checked=[];skipped=[];reviewed=false;existing=[];
  try{
   const result=await previewTechnicalRows(source,selected);
   rows=result.rows;skipped=result.skipped;
   try{const central=await call('projects/'+encodeURIComponent(selected)+'/sections');existing=(central.sections||[]).map((s:any)=>s.section_id)}
   catch(e){if((e as Error&{status?:number}).status!==404)throw e}
  }catch(e){rows=[];error=(e as Error).message||'No se pudo preparar el proyecto.'}
  finally{busy=false}
 }
 async function readTeam(){
  if(busy||!selected)return;
  busy=true;error='';message='';changes=[];approved=[];acceptReview=false;
  try{
   const manifest=await call('engineering/manifest');
   source=manifest.snapshot;rev=manifest.rev;available=savedProjects(source);
   const target='projects/'+encodeURIComponent(selected)+'/sections';
   const result=await call(target);
   const known=new Set((await previewTechnicalRows(source,selected)).rows.map(r=>r.id));
   const records=[];
   for(const section of result.sections||[])if(known.has(section.section_id))records.push(await call(target+'/'+encodeURIComponent(section.section_id)));
   changes=(await reviewTeamChanges(source,selected,records)).changes;
   if(!changes.length)message='No hay diferencias pendientes en las filas vinculadas.';
  }catch(e){error=(e as Error).message||'No se pudieron revisar los cambios.'}
  finally{busy=false}
 }
 async function mergeTeam(){
  if(busy||!acceptReview||!approved.length)return;
  busy=true;error='';message='';
  try{
   const current=await call('engineering/manifest');
   if(current.rev!==rev)throw Error('El expediente cambió. Consulta de nuevo los cambios del equipo.');
   const chosen=changes.filter(c=>approved.includes(c.id));
   const records=[];
   for(const c of chosen){
    const record=await call('projects/'+encodeURIComponent(selected)+'/sections/'+encodeURIComponent(c.id));
    if(record.revision!==c.revision)throw Error('El equipo modificó una fila después de la revisión. Consulta nuevamente.');
    records.push(record);
   }
   const fresh=(await reviewTeamChanges(current.snapshot,selected,records)).changes;
   if(JSON.stringify(fresh)!==JSON.stringify(chosen))throw Error('Los cambios actuales no coinciden con la selección revisada.');
   const result=await applyTeamChanges(current.snapshot,selected,fresh),next=crypto.randomUUID();
   const receipt=await call('engineering/manifest','PUT',{snapshot:result.snapshot,expected:current.rev,rev:next});
   if(receipt.ok!==true||receipt.rev!==next)throw Error('No se confirmó el expediente actualizado');
   source=result.snapshot;rev=next;message='Cambios incorporados al expediente: '+result.applied.length+'. Cierra y vuelve a abrir la ingeniería online para consultar la revisión actualizada.';
   changes=[];approved=[];acceptReview=false;rows=[];checked=[];reviewed=false;
  }catch(e){error=(e as Error).message||'No se confirmó la incorporación.'}
  finally{busy=false}
 }
 async function share(){
  if(busy||!selected||!reviewed||!checked.length)return;
  busy=true;error='';message='';let sent=0,already=0;
  try{
   const current=await call('engineering/manifest');
   if(current.rev!==rev)throw Error('El expediente de ingeniería cambió. Vuelve a cargar y revisar antes de compartir.');
   const project=available.find(p=>p.id===selected);
   if(!project)throw Error('Proyecto no disponible');
   const items=rows.filter(r=>checked.includes(r.id)&&!existing.includes(r.id));
   if(!items.length)throw Error('No hay filas nuevas seleccionadas');
   const target='projects/'+encodeURIComponent(project.id);
   // Reuse the original project ID; never match by name or overwrite a row.
   try{await call(target+'/sections')}catch(e){
    if((e as Error&{status?:number}).status!==404)throw e;
    await call('projects','POST',{id:project.id,name:project.name});
   }
   for(const item of items){
    const path=target+'/sections/'+encodeURIComponent(item.id);
    try{await call(path);already++;existing=[...existing,item.id];continue}
    catch(e){if((e as Error&{status?:number}).status!==404)throw e}
    await call(path,'PUT',{operationId:crypto.randomUUID(),baseRevision:0,data:item.body});
    sent++;existing=[...existing,item.id];
   }
   message='Filas nuevas compartidas: '+sent+' · Existentes conservadas: '+already+'. Asigna las cuentas del equipo en Proyectos y personal.';
   checked=[];reviewed=false;
  }catch(e){error=(e as Error).message+' · Confirmadas en esta operación: '+sent+'. No se sobrescribieron filas existentes.'}
  finally{busy=false}
 }
</script>
<section class="rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label="Compartir tareas y materiales del expediente">
 <div><h3 class="text-xl font-extrabold">Compartir expediente con el equipo</h3><p class="text-sm text-slate-500">Selecciona tareas y materiales manuales de un proyecto guardado en EV Pro Online. Se reutiliza su identificador original y se crean únicamente filas técnicas nuevas. Las modificaciones posteriores se incorporan al expediente previa revisión del administrador.</p></div>
 <div class="flex flex-wrap gap-2"><button type="button" class="rounded-lg border px-3 py-2" disabled={busy} onclick={load}>{busy?'Procesando…':'Consultar proyectos guardados'}</button><button type="button" class="rounded-lg border px-3 py-2" disabled={busy} onclick={()=>void onRefresh()}>Actualizar panel de asignaciones</button></div>
 {#if error}<p role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>{/if}
 {#if message}<p role="status" class="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{message}</p>{/if}
 {#if source!==null}
  <label class="block text-sm font-semibold">Expediente de ingeniería<select class="block w-full rounded-lg border p-2 mt-1" bind:value={selected} disabled={busy} onchange={()=>{rows=[];checked=[];reviewed=false;skipped=[];existing=[];changes=[];approved=[];acceptReview=false}}><option value="">Seleccionar</option>{#each available as p}<option value={p.id}>{p.name}{projects.some(x=>x.id===p.id)?' · registrado':''}</option>{/each}</select></label>
  <button type="button" class="rounded-lg border px-3 py-2" disabled={busy||!selected} onclick={preview}>Preparar selección técnica</button>
  <button type="button" class="rounded-lg border px-3 py-2" disabled={busy||!selected} onclick={readTeam}>Revisar cambios del equipo</button>
 {/if}
 {#if rows.length}
  <div class="max-h-96 overflow-auto border rounded-lg divide-y">
   {#each rows as row (row.id)}
    <label class="flex gap-3 items-start p-3 text-sm"><input type="checkbox" bind:group={checked} value={row.id} disabled={busy||existing.includes(row.id)} onchange={()=>reviewed=false}/><span class="min-w-0 break-words"><strong>{row.body.title||row.body.name}</strong><br/><span class="text-slate-500">{row.site} · {row.kind==='task'?'Tarea '+(row.body.dueDate||'sin fecha'):'Material · '+row.body.quantity+' '+row.body.unit}{existing.includes(row.id)?' · ya compartido, se conserva':''}</span></span></label>
   {/each}
  </div>
  <label class="flex gap-2 text-sm"><input type="checkbox" bind:checked={reviewed} disabled={busy||!checked.length}/> He revisado el texto y autorizo compartir estas filas con el personal asignado. No incluye costos ni archivos; los nombres escritos manualmente deben revisarse.</label>
  <button type="button" disabled={busy||!reviewed||!checked.length} class="rounded-lg bg-teal-800 text-white px-4 py-3 disabled:opacity-50" onclick={share}>Compartir {checked.length} filas seleccionadas</button>
 {/if}
 {#if changes.length}
  <h4 class="font-bold">Cambios propuestos por el equipo</h4>
  <p class="text-sm text-slate-600">Selecciona qué valores del servidor reemplazarán los valores actuales del expediente. Los demás campos permanecen intactos. Cierra la ingeniería online antes de incorporar cambios.</p>
  <div class="max-h-96 overflow-auto border rounded-lg divide-y">
   {#each changes as change (change.id)}
    <label class="flex gap-3 items-start p-3 text-sm"><input type="checkbox" value={change.id} bind:group={approved} disabled={busy} onchange={()=>acceptReview=false}/><span class="min-w-0 break-words"><strong>{change.before.title||change.before.name}</strong> · {change.site}<br/>Actual: {Object.values(change.before).join(' · ')}<br/>Equipo: {Object.values(change.incoming).join(' · ')} · rev. {change.revision}</span></label>
   {/each}
  </div>
  <label class="flex gap-2 text-sm"><input type="checkbox" bind:checked={acceptReview} disabled={busy||!approved.length}/> Confirmo reemplazar exclusivamente los valores seleccionados por los valores revisados del equipo.</label>
  <button type="button" class="rounded-lg bg-teal-800 text-white px-4 py-3 disabled:opacity-50" disabled={busy||!acceptReview||!approved.length} onclick={mergeTeam}>Incorporar {approved.length} cambios al expediente</button>
 {/if}
 {#if skipped.length}<p class="text-sm text-amber-800">{skipped.length} filas omitidas por formato, unidad o cantidad no compatibles. Revísalas en el expediente original.</p>{/if}
 <p class="text-xs text-slate-500">El equipo accede únicamente a proyectos asignados y filas técnicas autorizadas. No se reservan existencias ni se publica información en el catálogo público.</p>
</section>
