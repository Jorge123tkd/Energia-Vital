<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import Pagination from './Pagination.svelte';
  let { token, ownId }: { token: string; ownId: string } = $props();
  let users: any[] = $state([]);
  let page = $state(1);
  const perPage = 10;
  let pageCount = $derived(Math.max(1, Math.ceil(users.length / perPage)));
  let pageRows = $derived(users.slice((Math.min(page,pageCount)-1)*perPage,Math.min(page,pageCount)*perPage));
  let loading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let success = $state('');
  let showCreate = $state(false);
  let email = $state('');
  let password = $state('');
  let role = $state<'admin' | 'operator'>('operator');
  async function refresh() {
    loading = true;
    try { users = (await api.listStaff(token)).users || []; }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo obtener el personal'; }
    finally { loading = false; }
  }
  onMount(() => { void refresh(); });
  async function create(e: SubmitEvent) {
    e.preventDefault(); if (busy) return;
    error = ''; success = ''; busy = true;
    try {
      await api.createStaff(token, { email: email.trim().toLowerCase(), password, role });
      password = ''; email = ''; role = 'operator'; showCreate = false;
      success = 'Cuenta creada. Comparte sus credenciales por un canal privado; recomendamos cambiarlas al acceder.';
      await refresh();
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo crear la cuenta'; }
    finally { busy = false; }
  }
  async function change(u: any, nextRole: 'admin' | 'operator' | null, nextActive: boolean | null) {
    if (busy) return;
    const description = nextRole ? 'cambiar el rol de ' + u.email : nextActive ? 'reactivar ' + u.email : 'desactivar ' + u.email;
    if (!window.confirm('¿Confirmas ' + description + '? Se cerrarán sus sesiones existentes.')) return;
    error = ''; success = ''; busy = true;
    try {
      await api.updateStaff(token, u.id, nextRole ? { role: nextRole } : { is_active: Boolean(nextActive) });
      success = 'Permisos actualizados. Las sesiones anteriores se han cerrado.';
      await refresh();
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudieron cambiar los permisos'; }
    finally { busy = false; }
  }
</script>
<section class="space-y-5">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div><h2 class="text-2xl font-extrabold text-slate-900">Equipo y permisos</h2>
      <p class="text-sm text-slate-500 mt-1">Gestiona administradores y moderadores con cuentas separadas de los clientes.</p></div>
    <button onclick={() => { showCreate = true; error = ''; }} class="px-4 py-3 bg-teal-700 text-white rounded-xl font-semibold">+ Crear miembro</button>
  </header>
  <div class="rounded-xl bg-teal-50 border border-teal-100 text-teal-950 text-sm p-4">
    <strong>Permisos:</strong> el administrador configura la empresa, los clientes y el personal. El moderador revisa solicitudes y citas, pero no puede gestionar roles, eliminar clientes ni modificar el sitio.
    Por seguridad, una cuenta de cliente existente no se convierte automáticamente en cuenta administrativa; usa un correo independiente para el personal.
  </div>
  {#if error}<p role="alert" class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">{error}</p>{/if}
  {#if success}<p role="status" class="bg-emerald-50 text-emerald-800 p-4 rounded-xl">{success}</p>{/if}
  {#if loading}<p class="text-slate-500 text-sm">Cargando miembros…</p>{/if}
  <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {#each pageRows as u (u.id)}
      <article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3 min-w-0">
        <p class="text-sm font-bold text-slate-900 break-all">{u.email}</p>
        <div class="flex gap-2 items-center justify-between">
          <span class="text-xs font-semibold px-2 py-1 rounded-full {u.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}">{u.is_active ? 'Activo' : 'Inactivo'}</span>
          <span class="text-xs text-slate-600">{u.role === 'admin' ? 'Administrador' : 'Moderador'}</span>
        </div>
        <label class="block text-xs font-semibold text-slate-600">Rol
          <select class="block mt-1 w-full rounded-lg border border-slate-300 p-2 bg-white" value={u.role} disabled={busy || u.id === ownId}
            onchange={e => change(u, e.currentTarget.value as 'admin'|'operator', null)}>
            <option value="operator">Moderador</option><option value="admin">Administrador</option>
          </select>
        </label>
        <button type="button" disabled={busy || u.id === ownId}
          class="w-full border rounded-xl px-3 py-2 text-sm font-semibold {u.is_active ? 'border-red-200 text-red-700' : 'border-teal-200 text-teal-800'} disabled:opacity-40"
          onclick={() => change(u, null, !u.is_active)}>{u.is_active ? 'Desactivar cuenta' : 'Reactivar cuenta'}</button>
        {#if u.id === ownId}<p class="text-xs text-slate-500">Tu cuenta está protegida contra auto-bloqueo.</p>{/if}
      </article>
    {/each}
  </div>
  <Pagination page={Math.min(page,pageCount)} total={users.length} perPage={perPage}
    label="miembros del equipo" onPage={n => page = n} />
  {#if !users.length && !loading}<p class="text-sm text-slate-500">No hay usuarios del personal que mostrar.</p>{/if}
</section>
{#if showCreate}
  <div class="fixed inset-0 z-[180] bg-slate-950/70 flex justify-center items-center p-4">
    <dialog open aria-label="Crear cuenta de personal" class="m-0 bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 shadow-2xl">
      <div class="flex justify-between items-center mb-5">
        <h2 class="font-bold text-2xl text-slate-900">Nueva cuenta del equipo</h2>
        <button type="button" onclick={() => { showCreate = false; password = ''; }} aria-label="Cerrar" class="p-2 bg-slate-100 rounded-lg">✕</button>
      </div>
      {#if error}<p class="mb-4 text-red-700 text-sm" role="alert">{error}</p>{/if}
      <form onsubmit={create} class="space-y-4">
        <label class="block text-sm font-semibold">Correo de acceso<input type="email" required class="staff-input" autocomplete="off" bind:value={email}/></label>
        <label class="block text-sm font-semibold">Contraseña provisional (mínimo 12 caracteres)<input type="password" required minlength="12" maxlength="128" class="staff-input" autocomplete="new-password" bind:value={password}/></label>
        <label class="block text-sm font-semibold">Permiso
          <select bind:value={role} class="staff-input"><option value="operator">Moderador</option><option value="admin">Administrador</option></select>
        </label>
        <p class="text-xs text-slate-500">El correo no debe pertenecer ya a un cliente. Evita compartir contraseñas en chats públicos.</p>
        <button disabled={busy} class="w-full rounded-xl p-3 bg-teal-700 text-white font-semibold">{busy ? 'Creando…' : 'Crear cuenta segura'}</button>
      </form>
    </dialog>
  </div>
{/if}
<style>
  .staff-input { display:block; margin-top:.45rem; width:100%; padding:.8rem; border-radius:.75rem; border:1px solid #cbd5e1; background:white; }
</style>
