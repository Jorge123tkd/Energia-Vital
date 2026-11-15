<script lang="ts">
  import {onMount} from 'svelte';
  import {api} from '../lib/api';
  type Account={id:string;brigade_id:string;brigade_name:string;email:string;is_active:number;updated_at:string};
  type Brigade={id:string;name:string;is_active:number};
  let {token,brigades}:{token:string;brigades:Brigade[]}=$props();
  let accounts:Account[]=$state([]),busy=$state(false),error=$state(''),success=$state('');
  let creating=$state(false),resetFor=$state(''),newBrigade=$state(''),newEmail=$state(''),
    newPassword=$state(''),replacement=$state('');
  async function refresh(){
    error='';
    try{const x=await api.listChiefAccounts(token);accounts=x.accounts||[];}
    catch(e){error=e instanceof Error?e.message:'No se pudieron consultar las cuentas técnicas.';}
  }
  onMount(()=>{void refresh();});
  async function create(e:SubmitEvent){
    e.preventDefault();if(busy)return;
    busy=true;error='';success='';
    try{
      const r=await api.createChiefAccount(token,{
        brigade_id:newBrigade,email:newEmail.trim(),password:newPassword
      });
      success=r.message;creating=false;newPassword='';newEmail='';newBrigade='';
      await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo crear el acceso.';}
    finally{busy=false;}
  }
  async function change(account:Account,isActive?:boolean,password?:string){
    if(busy)return;
    if(!window.confirm('¿Cambiar esta cuenta técnica? Se cerrarán sus sesiones anteriores.'))return;
    busy=true;error='';success='';
    try{
      const r=await api.updateChiefAccount(token,account.id,{
        ...(isActive!==undefined?{is_active:isActive}:{}),
        ...(password?{password}:{}),expected_updated_at:account.updated_at
      });
      success=r.message;resetFor='';replacement='';await refresh();
    }catch(e){error=e instanceof Error?e.message:'No se pudo actualizar la cuenta.';}
    finally{busy=false;}
  }
</script>

<section class="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" aria-label="Accesos de jefes de brigada">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <h3 class="text-lg font-extrabold">Credenciales individuales de jefes</h3>
      <p class="text-xs text-slate-600">Cuentas técnicas independientes; no conceden permisos de gestor ni administrador.</p>
    </div>
    <button type="button" onclick={()=>creating=!creating} class="bg-teal-700 text-white rounded-lg px-3 py-2 text-xs font-bold">
      {creating?'Cerrar formulario':'+ Crear acceso de jefe'}
    </button>
  </div>
  <p class="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
    Crea como máximo una cuenta de jefe por brigada activa. Entrega la contraseña fuera de este sistema
    mediante un canal seguro. Si desactivas una cuenta o cambias su contraseña, sus sesiones se revocan.
    Entrada del jefe: <a href="/jefe-brigada" class="underline font-bold">/jefe-brigada</a>.
  </p>
  {#if error}<p role="alert" class="text-sm text-red-800 bg-red-50 p-2 rounded">{error}</p>{/if}
  {#if success}<p role="status" class="text-sm text-teal-800 bg-teal-50 p-2 rounded">{success}</p>{/if}
  {#if creating}
    <form onsubmit={create} class="rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-3">
      <label class="block text-xs font-bold">Brigada activa sin jefe registrado
        <select required bind:value={newBrigade} class="block w-full mt-1 border rounded-lg p-2 bg-white">
          <option value="">Selecciona una brigada</option>
          {#each brigades.filter(b=>b.is_active&&!accounts.some(a=>a.brigade_id===b.id)) as b}
            <option value={b.id}>{b.name}</option>
          {/each}
        </select>
      </label>
      <label class="block text-xs font-bold">Correo del jefe
        <input type="email" bind:value={newEmail} required autocomplete="off" maxlength="254"
          class="block w-full mt-1 border rounded-lg p-2 bg-white"/>
      </label>
      <label class="block text-xs font-bold">Contraseña inicial (12–128 caracteres)
        <input type="password" bind:value={newPassword} required minlength="12" maxlength="128"
          autocomplete="new-password" class="block w-full mt-1 border rounded-lg p-2 bg-white"/>
      </label>
      <button type="submit" disabled={busy} class="bg-teal-700 text-white rounded-lg px-4 py-2 font-bold text-sm">
        Crear identidad técnica
      </button>
    </form>
  {/if}
  {#each accounts as a (a.id)}
    <article class="border border-slate-200 rounded-xl p-3 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-bold">{a.brigade_name}</p>
          <p class="text-xs text-slate-600 break-all">{a.email} · {a.is_active?'Activo':'Desactivado'}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onclick={()=>change(a,!Boolean(a.is_active))}
            class="border rounded-lg px-3 py-2 text-xs font-semibold">
            {a.is_active?'Desactivar':'Reactivar'}
          </button>
          <button type="button" disabled={busy} onclick={()=>{resetFor=resetFor===a.id?'':a.id;replacement='';}}
            class="border rounded-lg px-3 py-2 text-xs font-semibold">Cambiar contraseña</button>
        </div>
      </div>
      {#if resetFor===a.id}
        <form onsubmit={e=>{e.preventDefault();void change(a,undefined,replacement);}} class="space-y-2">
          <label class="block text-xs font-bold">Nueva contraseña
            <input type="password" minlength="12" maxlength="128" required
              autocomplete="new-password" bind:value={replacement}
              class="block w-full border rounded-lg p-2 mt-1"/>
          </label>
          <button disabled={busy||replacement.length<12} type="submit"
            class="bg-teal-700 text-white px-3 py-2 rounded-lg text-xs font-bold">Actualizar y cerrar sesiones</button>
        </form>
      {/if}
    </article>
  {:else}<p class="text-sm text-slate-500">Todavía no se ha creado ningún acceso técnico.</p>{/each}
  <button type="button" onclick={refresh} class="text-xs text-teal-800 underline font-bold">Actualizar accesos</button>
</section>
