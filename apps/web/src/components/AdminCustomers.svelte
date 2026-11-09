<script lang="ts">
  import { api } from '../lib/api';
  let { token, customers, onRefresh }: {
    token: string; customers: any[]; onRefresh: () => Promise<void>;
  } = $props();

  let query = $state('');
  let edit: any = $state(null);
  let busy = $state(false);
  let error = $state('');
  let success = $state('');
  let visible = $derived(customers.filter(c =>
    [c.name, c.email, c.phone, c.city, c.province].some(v =>
      String(v || '').toLowerCase().includes(query.toLowerCase().trim()))));
  async function task(action: () => Promise<void>) {
    error = ''; success = ''; busy = true;
    try { await action(); }
    catch (e) { error = e instanceof Error ? e.message : 'No se pudo completar la acción.'; }
    finally { busy = false; }
  }
  function openEditor(c: any) {
    edit = { id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '',
      address: c.address || '', city: c.city || '', province: c.province || '' };
    error = ''; success = '';
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!edit) return;
    await task(async () => {
      await api.updateAdminCustomer(token, edit.id, {
        name: edit.name, email: edit.email, phone: edit.phone,
        address: edit.address, city: edit.city, province: edit.province
      });
      edit = null; await onRefresh(); success = 'Datos del cliente actualizados.';
    });
  }
  async function setStatus(customer: any) {
    const active = Boolean(customer.is_active);
    const action = active ? 'bloquear y cerrar todas sus sesiones' : 'reactivar';
    if (!window.confirm(`¿Quieres ${action} la cuenta de ${customer.name}?`)) return;
    await task(async () => {
      await api.setAdminCustomerStatus(token, customer.id, !active);
      await onRefresh();
      success = active ? 'Cliente bloqueado: las sesiones activas se han cerrado.' : 'Cliente reactivado.';
    });
  }
  async function remove(customer: any) {
    if (!window.confirm(`Eliminar definitivamente a ${customer.name}? Esta operación no se puede deshacer. Si tiene solicitudes o citas guardadas, el sistema impedirá eliminarlo.`)) return;
    await task(async () => {
      await api.deleteAdminCustomer(token, customer.id);
      await onRefresh();
      success = 'Cuenta eliminada definitivamente.';
    });
  }
</script>

<section class="space-y-5">
  <header class="flex flex-wrap items-end gap-3 justify-between">
    <div>
      <h2 class="text-2xl font-bold text-slate-900">Clientes registrados <span class="text-slate-400 text-lg">({customers.length})</span></h2>
      <p class="text-sm text-slate-500 mt-1">Gestiona sus datos, bloquea cuentas y protege el historial de solicitudes.</p>
    </div>
    <input class="border border-slate-300 bg-white rounded-xl px-4 py-3 w-full sm:w-72" placeholder="Buscar cliente…" aria-label="Buscar cliente" bind:value={query} />
  </header>
  {#if error}<p role="alert" class="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl">{error}</p>{/if}
  {#if success}<p role="status" class="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">{success}</p>{/if}

  {#if visible.length}
    <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each visible as c (c.id)}
        <article class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div><h3 class="font-bold text-lg text-slate-900">{c.name}</h3><p class="text-sm text-slate-500">{c.email || 'Sin correo'}</p></div>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full {c.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}">{c.is_active ? 'Activo' : 'Bloqueado'}</span>
          </div>
          <div class="text-sm text-slate-600 space-y-1">
            <p>Teléfono: {c.phone || 'No registrado'}</p>
            <p>{[c.address, c.city, c.province].filter(Boolean).join(', ') || 'Sin dirección'}</p>
          </div>
          <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button class="rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm px-3 py-2" onclick={() => openEditor(c)}>Editar</button>
            <button disabled={busy} class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onclick={() => setStatus(c)}>{c.is_active ? 'Bloquear' : 'Reactivar'}</button>
            <button disabled={busy} class="rounded-lg border border-red-200 text-red-700 hover:bg-red-50 px-3 py-2 text-sm font-semibold" onclick={() => remove(c)}>Eliminar</button>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <p class="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">{customers.length ? 'No hay clientes con esos datos.' : 'Todavía no se han registrado clientes.'}</p>
  {/if}
</section>

{#if edit}
  <div class="fixed inset-0 z-[150] bg-slate-950/70 flex items-center justify-center p-4">
    <dialog open aria-label="Editar ficha del cliente" class="relative m-0 rounded-2xl bg-white shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-6">
      <div class="flex justify-between items-center mb-5 gap-3">
        <h2 class="text-xl font-bold">Editar cliente</h2>
        <button type="button" aria-label="Cerrar" onclick={() => edit = null} class="px-3 py-2 rounded-lg bg-slate-100">✕</button>
      </div>
      {#if error}<p class="mb-3 text-red-700" role="alert">{error}</p>{/if}
      <form onsubmit={save} class="space-y-4">
        <label class="block text-sm font-semibold">Nombre completo<input class="form-field" required minlength="3" bind:value={edit.name} /></label>
        <label class="block text-sm font-semibold">Correo electrónico<input class="form-field" type="email" required bind:value={edit.email} /></label>
        <label class="block text-sm font-semibold">Teléfono<input class="form-field" type="tel" required bind:value={edit.phone} /></label>
        <label class="block text-sm font-semibold">Dirección<input class="form-field" required minlength="6" bind:value={edit.address} /></label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block text-sm font-semibold">Municipio<input class="form-field" required minlength="2" bind:value={edit.city} /></label>
          <label class="block text-sm font-semibold">Provincia<input class="form-field" required minlength="2" bind:value={edit.province} /></label>
        </div>
        <p class="text-xs text-slate-500">Los administradores no pueden ver ni editar la contraseña de los clientes. Si cambias su teléfono se reiniciará su verificación.</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="px-4 py-3 rounded-xl border" onclick={() => edit = null}>Cancelar</button>
          <button disabled={busy} class="px-5 py-3 rounded-xl bg-teal-700 text-white font-semibold">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </dialog>
  </div>
{/if}

<style>
  .form-field { display:block; margin-top:.4rem; width:100%; border:1px solid #cbd5e1; border-radius:.75rem; padding:.75rem; background:white; }
  button:disabled { opacity:.6; cursor:not-allowed; }
</style>
