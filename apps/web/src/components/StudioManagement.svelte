<script lang="ts">
 import { apiRequest } from '../lib/api';
 import {onMount} from 'svelte';
 let {token,projects,onRefresh}:{token:string;projects:{id:string;name:string}[];onRefresh:()=>Promise<void>}=$props();
 let staff=$state<any[]>([]),members=$state<any[]>([]),assignments=$state<any[]>([]),project=$state(''),target=$state(''),studioRole=$state('worker'),requestId=$state(''),busy=$state(false),message=$state(''),problem=$state(''),staffLoaded=$state(false),truncated=$state(false);
 const call=(path:string,method='GET',body?:unknown)=>apiRequest(path,{method,headers:{Authorization:'Bearer '+token},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function action(fn:()=>Promise<void>){
  if(busy)return;busy=true;message='';problem='';
  try{await fn()}catch(e){problem=(e as Error&{status?:number}).status===503?'Función aún no habilitada o servicio no disponible.':(e as Error).message||'No se confirmó la operación.'}
  finally{busy=false}
 }
 async function collect(path:string,key:string){
  let all:any[]=[],cursor:string|null=null;
  for(let page=0;page<20;page++){
   const r=await call(path+(cursor?'?after='+encodeURIComponent(cursor):''));
   if(!Array.isArray(r[key]))throw Error('Respuesta incompleta de '+key);
   all=[...all,...r[key]];
   const next=r.next==null?null:String(r.next);
   if(!next)return {all,truncated:false};
   if(next===cursor)throw Error('Paginación inválida.');
   cursor=next;
  }
  return {all,truncated:true};
 }
 let targetMember=$derived(members.find(x=>x.user_id===target));
 let targetStaff=$derived(staff.find(x=>x.id===target));
 let assignable=$derived(staffLoaded&&!truncated&&targetMember?.role==='worker'&&Number(targetMember.active)===1);
 function chooseTarget(id:string){target=id;studioRole=staff.find(x=>x.id===id)?.role==='admin'?'admin':'worker'}
 async function loadTeam(){
  staffLoaded=false;staff=[];members=[];truncated=false;
  const [a,b]=await Promise.all([call('/api/admin/users'),collect('/api/studio/v1/admin/members','members')]);
  staff=Array.isArray(a.users)?a.users.filter((x:any)=>(x.is_active===1||x.is_active===true)&&['admin','operator'].includes(x.role)):[];
  members=b.all;truncated=b.truncated;staffLoaded=true;if(target&&!staff.some(x=>x.id===target))target='';
 }
 async function loadAssignments(){
  assignments=[];if(!project)return;
  const a=await collect('/api/studio/v1/projects/'+encodeURIComponent(project)+'/assignments','assignments');
  assignments=a.all;truncated=truncated||a.truncated;
 }
 async function refresh(){await action(async()=>{await loadTeam();await loadAssignments();})}
 async function member(active:boolean){await action(async()=>{
  if(!target||!staffLoaded||truncated)throw Error('Selecciona una cuenta existente y consulta primero todos los permisos.');
  if(!targetStaff)throw Error('La cuenta central no está activa.');
  studioRole=targetStaff.role==='admin'?'admin':'worker';
  await call('/api/studio/v1/admin/members/'+encodeURIComponent(target),'PUT',{role:studioRole,active});message=active?'Autorización registrada.':'Acceso desactivado; la cuenta central permanece.';await loadTeam();
 })}
 async function assign(add:boolean){await action(async()=>{
  if(!project||!target||!staffLoaded||truncated)throw Error('Selecciona proyecto y trabajador con permisos verificados.');
  if(add&&!assignable)throw Error('Autoriza primero al trabajador con rol Trabajador.');
  const result=await call('/api/studio/v1/projects/'+encodeURIComponent(project)+'/assignments/'+encodeURIComponent(target),add?'PUT':'DELETE',add?{}:undefined);
  await loadAssignments();
  const present=assignments.some(a=>a.user_id===target);
  if(truncated||present!==add)throw Error('No se pudo verificar el estado de la asignación.');
  message=result.changed?(add?'Asignación confirmada.':'Asignación retirada.'):(add?'El trabajador ya estaba asignado.':'El trabajador no estaba asignado.');
 })}
 onMount(()=>{void refresh()});
 async function link(){await action(async()=>{
  if(!project||!requestId.trim())throw Error('Indica el identificador de una solicitud existente.');
  await call('/api/warehouse/projects/'+encodeURIComponent(project)+'/link','POST',{requestId:requestId.trim()});message='Vinculación comercial confirmada.';
 })}
</script>
<section class="rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label="Administración de proyectos y personal">
 <div><h3 class="text-xl font-extrabold">Personal y asignaciones</h3><p class="text-sm text-slate-500">Usa las cuentas activas de Bonaire. Administración conserva su rol central; los moderadores acceden a los proyectos asignados. No se crean otras contraseñas.</p></div>
 <button type="button" class="rounded-lg border px-3 py-2 text-sm" disabled={busy} onclick={refresh}>Consultar personal y asignaciones</button>
 {#if problem}<p role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{problem}</p>{/if}
 {#if message}<p role="status" class="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{message}</p>{/if}
 {#if truncated}<p class="text-xs text-slate-500">Hay más registros; esta primera vista no representa el listado completo.</p>{/if}
 <p class="text-sm text-slate-500">Crea expedientes únicamente en Proyectos. Vincula el expediente y asigna al moderador. Si aún no ha iniciado sesión, puedes registrar su permiso con Autorizar. Las revocaciones explícitas requieren reactivación. Comparte tareas y materiales desde la pestaña correspondiente; se conserva el identificador original.</p>
 <div class="grid gap-3 md:grid-cols-2">
  <label class="text-sm font-semibold">Proyecto<select class="mt-1 block w-full rounded-lg border p-2" bind:value={project} disabled={busy} onchange={()=>void action(loadAssignments)}><option value="">Seleccionar</option>{#each projects as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
  <label class="text-sm font-semibold">Cuenta central<select class="mt-1 block w-full rounded-lg border p-2" value={target} onchange={e=>chooseTarget(e.currentTarget.value)} disabled={busy||!staffLoaded}><option value="">Seleccionar</option>{#each staff as v}<option value={v.id}>{v.email}</option>{/each}</select></label>
  <div class="text-sm font-semibold">Rol según Bonaire<p class="mt-1 rounded-lg border p-2 font-normal">{targetStaff?targetStaff.role==='admin'?'Administrador':'Moderador / trabajador':'Selecciona una cuenta'}</p></div>
  <div class="flex gap-2 flex-wrap items-end"><button type="button" disabled={busy||!target||!staffLoaded||truncated} onclick={()=>member(true)} class="rounded-lg border px-3 py-2 text-sm">Autorizar</button><button type="button" disabled={busy||!target||!targetMember||truncated} onclick={()=>member(false)} class="rounded-lg border px-3 py-2 text-sm">Desactivar acceso</button></div>
 </div>
 {#if target}<p class="text-sm">Membresía: {members.find(x=>x.user_id===target)?.role||'No figura en esta página'} · {members.find(x=>x.user_id===target)?.active?'Activa':'Sin confirmar'}</p>{/if}
 <div class="flex flex-wrap gap-2"><button type="button" disabled={busy||!target||!project||!assignable} onclick={()=>assign(true)} class="rounded-lg bg-teal-800 text-white px-3 py-2 text-sm">Asignar al proyecto</button><button type="button" disabled={busy||!target||!project||truncated||!assignments.some(a=>a.user_id===target)} onclick={()=>assign(false)} class="rounded-lg border px-3 py-2 text-sm">Retirar asignación</button></div>
 {#if project}<p class="text-sm font-semibold">Asignaciones consultadas: {assignments.length}</p>{#each assignments as a}<p class="text-sm">{staff.find(s=>s.id===a.user_id)?.email||a.user_id}</p>{/each}{/if}
 <form class="flex gap-2 flex-wrap items-end border-t pt-4" onsubmit={e=>{e.preventDefault();void link()}}><label class="text-sm flex-1 min-w-0 font-semibold">Solicitud comercial existente<input class="block w-full mt-1 rounded-lg border p-2" bind:value={requestId} maxlength="100" required placeholder="Identificador de solicitud"/></label><button type="submit" class="rounded-lg border px-3 py-2 text-sm" disabled={busy||!project}>Vincular proyecto</button></form>
 <p class="text-xs text-slate-500">Las funciones de escritura tienen habilitación independiente. La vinculación no crea otra solicitud.</p>
</section>