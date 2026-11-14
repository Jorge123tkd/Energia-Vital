<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import BrigadePlanner from './BrigadePlanner.svelte';

  type Brigade = {
    id:string;name:string;leader_name:string;specialty:string|null;
    is_active:number;updated_at:string;open_work_count:number;
  };
  type Member = {
    id:string;brigade_id:string;full_name:string;function_name:string|null;
    is_active:number;updated_at:string;
  };
  let {token,canManage,prefillRequestId=''}:{token:string;canManage:boolean;prefillRequestId?:string}=$props();
  let brigades:Brigade[]=$state([]),members:Member[]=$state([]);
  let loading=$state(false),busy=$state(false),error=$state(''),success=$state('');
  let expanded=$state('');
  let editor:Brigade|null=$state(null),showEditor=$state(false);
  let brigadeName=$state(''),leaderName=$state(''),specialty=$state('');
  let memberBrigade=$state(''),memberEditor:Member|null=$state(null);
  let memberName=$state(''),memberFunction=$state('');
  const field='block w-full mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';

  async function refresh(){
    loading=true;error='';
    try{
      const result=await api.listBrigades(token);
      brigades=result.brigades||[];members=result.members||[];
    }catch(e){error=e instanceof Error?e.message:'No se pudieron consultar las brigadas.';}
    finally{loading=false;}
  }
  onMount(()=>{void refresh();});
  function addBrigade(){
    editor=null;brigadeName='';leaderName='';specialty='';showEditor=true;
    error='';success='';
  }
  function editBrigade(b:Brigade){
    editor=b;brigadeName=b.name;leaderName=b.leader_name;specialty=b.specialty||'';
    showEditor=true;error='';success='';
  }
  async function saveBrigade(event:SubmitEvent){
    event.preventDefault();
    if(busy||!canManage)return;
    busy=true;error='';success='';
    try{
      const data={name:brigadeName.trim(),leader_name:leaderName.trim(),specialty:specialty.trim()};
      if(editor){
        await api.updateBrigade(token,editor.id,{...data,expected_updated_at:editor.updated_at});
        success='Ficha de brigada actualizada.';
      }else{
        const r=await api.createBrigade(token,data);
        expanded=r.id;
        success='Brigada registrada correctamente.';
      }
      showEditor=false;await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo guardar la brigada.';}
    finally{busy=false;}
  }
  async function toggleBrigade(b:Brigade){
    if(busy||!canManage)return;
    if(!window.confirm((b.is_active?'¿Desactivar':'¿Reactivar')+' la brigada «'+b.name+'»? No se eliminará su historial.'))return;
    busy=true;error='';success='';
    try{
      await api.updateBrigade(token,b.id,{is_active:!Boolean(b.is_active),expected_updated_at:b.updated_at});
      success=b.is_active?'Brigada desactivada.':'Brigada reactivada.';
      await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo cambiar el estado.';}
    finally{busy=false;}
  }
  function addMember(brigadeId:string){
    memberBrigade=brigadeId;memberEditor=null;memberName='';memberFunction='';
    error='';success='';
  }
  function editMember(m:Member){
    memberBrigade=m.brigade_id;memberEditor=m;memberName=m.full_name;
    memberFunction=m.function_name||'';error='';success='';
  }
  async function saveMember(event:SubmitEvent){
    event.preventDefault();
    if(!canManage||busy||!memberBrigade)return;
    busy=true;error='';success='';
    try{
      const data={full_name:memberName.trim(),function_name:memberFunction.trim()};
      if(memberEditor){
        await api.updateBrigadeMember(token,memberBrigade,memberEditor.id,{
          ...data,expected_updated_at:memberEditor.updated_at
        });
        success='Integrante actualizado.';
      }else{
        await api.addBrigadeMember(token,memberBrigade,data);
        success='Integrante añadido a la brigada.';
      }
      memberBrigade='';memberEditor=null;await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo guardar al integrante.';}
    finally{busy=false;}
  }
  async function toggleMember(m:Member){
    if(busy||!canManage)return;
    if(!window.confirm((m.is_active?'¿Desactivar':'¿Reactivar')+' al integrante «'+m.full_name+'»?'))return;
    busy=true;error='';success='';
    try{
      await api.updateBrigadeMember(token,m.brigade_id,m.id,{
        is_active:!Boolean(m.is_active),expected_updated_at:m.updated_at
      });
      success='Estado del integrante actualizado.';await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo cambiar el integrante.';}
    finally{busy=false;}
  }
</script>

<section class="space-y-5" aria-label="Gestión privada de brigadas">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-2xl font-extrabold text-slate-900">Brigadas de Bonaire</h2>
      <p class="text-sm text-slate-600 mt-1">Registra brigadas, jefes e integrantes. Datos visibles únicamente al personal autorizado.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" onclick={refresh} disabled={loading||busy}
        class="border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-semibold">↻ Actualizar</button>
      {#if canManage}
        <button type="button" onclick={addBrigade} disabled={busy}
          class="bg-teal-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold">+ Crear brigada</button>
      {/if}
    </div>
  </div>
  <p class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    <strong>Agenda técnica:</strong> cada trabajo se vincula a una solicitud. Con una o dos brigadas se exige
    revisar la ocupación; con más de dos, el segundo trabajo del día necesita autorización del administrador.
  </p>
  {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>{/if}
  {#if success}<p role="status" class="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{success}</p>{/if}
  {#if loading}<p role="status" class="text-sm text-slate-600">Consultando brigadas…</p>{/if}
  {#if !loading && !brigades.length}
    <div class="rounded-2xl border border-slate-200 bg-white p-7 text-slate-600">
      No hay brigadas registradas. {canManage?'Puedes crear la primera sin asignar trabajos.':'El administrador general puede registrar una.'}
    </div>
  {/if}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {#each brigades as brigade (brigade.id)}
      <article class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
        <div class="flex flex-wrap gap-2 justify-between items-start">
          <div class="min-w-0">
            <h3 class="font-extrabold text-lg text-slate-900 break-words">{brigade.name}</h3>
            <p class="text-sm text-slate-600 mt-1"><strong>Jefe:</strong> {brigade.leader_name}</p>
          </div>
          <span class="text-xs font-bold rounded-full px-2.5 py-1 {brigade.is_active?'bg-teal-50 text-teal-800':'bg-slate-100 text-slate-600'}">
            {brigade.is_active?'Activa':'Inactiva'}
          </span>
        </div>
        <p class="text-sm text-slate-600"><strong>Especialidad:</strong> {brigade.specialty||'Por definir'}</p>
        <p class="text-xs text-slate-500">
          Integrantes activos: {members.filter(m=>m.brigade_id===brigade.id&&m.is_active).length}
          · Trabajos abiertos: {brigade.open_work_count||0}
        </p>
        <div class="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button type="button" onclick={()=>expanded=expanded===brigade.id?'':brigade.id}
            class="rounded-xl border border-teal-200 px-3 py-2 text-xs font-bold text-teal-800">
            {expanded===brigade.id?'Ocultar integrantes':'Ver integrantes'}
          </button>
          {#if canManage}
            <button type="button" onclick={()=>editBrigade(brigade)} disabled={busy}
              class="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">Editar ficha</button>
            <button type="button" onclick={()=>toggleBrigade(brigade)} disabled={busy}
              class="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">
              {brigade.is_active?'Desactivar':'Reactivar'}
            </button>
          {/if}
        </div>
        {#if expanded===brigade.id}
          <div class="rounded-xl bg-slate-50 p-3 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="font-bold text-sm">Integrantes</h4>
              {#if canManage && brigade.is_active}
                <button type="button" onclick={()=>addMember(brigade.id)}
                  class="text-xs font-semibold text-teal-800 underline">+ Agregar integrante</button>
              {/if}
            </div>
            {#each members.filter(m=>m.brigade_id===brigade.id) as m (m.id)}
              <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold">{m.full_name} {m.is_active?'':'(inactivo)'}</p>
                  <p class="text-xs text-slate-500">{m.function_name||'Sin función especificada'}</p>
                </div>
                {#if canManage}
                  <div class="flex gap-2">
                    <button type="button" disabled={busy} onclick={()=>editMember(m)}
                      class="text-xs font-bold text-teal-800 underline">Editar</button>
                    <button type="button" disabled={busy} onclick={()=>toggleMember(m)}
                      class="text-xs font-bold text-slate-600 underline">{m.is_active?'Desactivar':'Reactivar'}</button>
                  </div>
                {/if}
              </div>
            {:else}
              <p class="text-sm text-slate-500">Todavía no hay integrantes registrados.</p>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
  <BrigadePlanner {token} canApprove={canManage} {prefillRequestId}/>
</section>

{#if showEditor && canManage}
  <div class="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/70 p-3">
    <dialog open aria-label="Ficha de brigada" class="m-0 bg-white rounded-3xl w-full max-w-lg p-5 sm:p-7 max-h-[90dvh] overflow-y-auto space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-extrabold">{editor?'Editar brigada':'Nueva brigada'}</h2>
        <button type="button" onclick={()=>showEditor=false} disabled={busy} aria-label="Cerrar" class="rounded-lg bg-slate-100 px-3 py-2">✕</button>
      </div>
      {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
      <form onsubmit={saveBrigade} class="space-y-4">
        <label class="block text-sm font-semibold">Nombre de la brigada
          <input type="text" required minlength="3" maxlength="120" bind:value={brigadeName} class={field}/>
        </label>
        <label class="block text-sm font-semibold">Nombre del jefe de brigada
          <input type="text" required minlength="3" maxlength="120" bind:value={leaderName} class={field}/>
        </label>
        <label class="block text-sm font-semibold">Especialidades o capacidades
          <textarea maxlength="300" rows="3" bind:value={specialty} class={field} placeholder="Instalaciones, reparaciones…"></textarea>
        </label>
        <p class="text-xs text-slate-500">La ficha de brigada es privada. El jefe no obtiene automáticamente acceso administrativo.</p>
        <button type="submit" disabled={busy} class="w-full bg-teal-700 text-white rounded-xl px-4 py-3 font-bold">{busy?'Guardando…':'Guardar brigada'}</button>
      </form>
    </dialog>
  </div>
{/if}

{#if memberBrigade && canManage}
  <div class="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/70 p-3">
    <dialog open aria-label="Integrante de brigada" class="m-0 bg-white rounded-3xl w-full max-w-lg p-5 sm:p-7 max-h-[90dvh] overflow-y-auto space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-extrabold">{memberEditor?'Editar integrante':'Añadir integrante'}</h2>
        <button type="button" onclick={()=>{memberBrigade='';memberEditor=null;}} disabled={busy} aria-label="Cerrar" class="rounded-lg bg-slate-100 px-3 py-2">✕</button>
      </div>
      {#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
      <form onsubmit={saveMember} class="space-y-4">
        <label class="block text-sm font-semibold">Nombre y apellidos
          <input type="text" required minlength="3" maxlength="120" bind:value={memberName} class={field}/>
        </label>
        <label class="block text-sm font-semibold">Función dentro de la brigada
          <input type="text" maxlength="100" bind:value={memberFunction} class={field} placeholder="Electricista, instalador…"/>
        </label>
        <button type="submit" disabled={busy} class="w-full bg-teal-700 text-white rounded-xl px-4 py-3 font-bold">{busy?'Guardando…':'Guardar integrante'}</button>
      </form>
    </dialog>
  </div>
{/if}
