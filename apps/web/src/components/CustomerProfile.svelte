<script lang="ts">
  import { api } from '../lib/api';
  import PageHero from './PageHero.svelte';
  let { user, onUpdate }: { user: any; onUpdate: (user: any) => void } = $props();
  let name = $state('');
  let phone = $state('');
  let address = $state('');
  let city = $state('');
  let province = $state('');
  $effect(() => {
    name = user.name ?? '';
    phone = user.phone ?? '';
    address = user.address ?? '';
    city = user.city ?? '';
    province = user.province ?? '';
  });
  let currentPassword = $state('');
  let newPassword = $state('');
  let error = $state('');
  let success = $state('');
  let busy = $state(false);

  async function save(event: SubmitEvent) {
    event.preventDefault(); error = ''; success = ''; busy = true;
    try {
      const r = await api.updateProfile({ name, phone, address, city, province });
      onUpdate(r.user);
      success = 'Datos actualizados.';
    } catch (e) { error = e instanceof Error ? e.message : 'Error al guardar'; }
    finally { busy = false; }
  }
  async function change(event: SubmitEvent) {
    event.preventDefault(); error = ''; success = ''; busy = true;
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      currentPassword = ''; newPassword = ''; success = 'Contraseña actualizada; otras sesiones cerradas.';
    } catch (e) { error = e instanceof Error ? e.message : 'Error al cambiar la contraseña'; }
    finally { busy = false; }
  }
</script>

<div class="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 px-3 sm:px-6 py-8 sm:py-12">
  <div class="max-w-5xl mx-auto space-y-7">
    <PageHero eyebrow="Bonaire · Área personal" title="Mi perfil"
      description="Actualiza tus datos de contacto, protege tu cuenta y recibe información sobre tus solicitudes y visitas." />
    {#if error}<p role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>{/if}
    {#if success}<p role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{success}</p>{/if}
    <div class="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 lg:gap-7 items-start">
      <form onsubmit={save} class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-4">
        <div class="flex items-center gap-3 mb-3"><span class="flex w-10 h-10 justify-center items-center bg-teal-700 rounded-xl text-white font-bold">01</span><h2 class="text-xl font-extrabold text-slate-900">Datos de contacto</h2></div>
        <div class="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">Correo de acceso: <strong class="text-slate-800 break-all">{user.email}</strong></div>
        <label class="profile-label">Nombre completo<input required minlength="3" bind:value={name} class="profile-input" autocomplete="name" /></label>
        <label class="profile-label">Teléfono<input type="tel" required bind:value={phone} class="profile-input" autocomplete="tel" /></label>
        <label class="profile-label">Dirección<input required minlength="6" bind:value={address} class="profile-input" autocomplete="street-address" /></label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="profile-label">Municipio<input required bind:value={city} class="profile-input" /></label>
          <label class="profile-label">Provincia<input required bind:value={province} class="profile-input" /></label>
        </div>
        <button disabled={busy} class="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl px-6 py-3.5 w-full font-bold">Guardar mi perfil</button>
      </form>
      <form onsubmit={change} class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-4">
        <div class="flex items-center gap-3 mb-3"><span class="flex w-10 h-10 justify-center items-center bg-teal-700 rounded-xl text-white font-bold">02</span><h2 class="text-xl font-extrabold text-slate-900">Seguridad</h2></div>
        <p class="text-sm text-slate-600">Cambia tu contraseña periódicamente. Al cambiarla, las demás sesiones se cerrarán.</p>
        <label class="profile-label">Contraseña actual<input required type="password" autocomplete="current-password" bind:value={currentPassword} class="profile-input" /></label>
        <label class="profile-label">Nueva contraseña (mínimo 10 caracteres)<input required type="password" minlength="10" autocomplete="new-password" bind:value={newPassword} class="profile-input" /></label>
        <button disabled={busy} class="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-xl px-6 py-3.5 w-full font-bold">Cambiar contraseña</button>
      </form>
    </div>
  </div>
</div>
<style>
  .profile-label { display:block; font-size:.875rem; font-weight:600; color:#334155; }
  .profile-input { display:block; width:100%; margin-top:.5rem; padding:.85rem 1rem; border:1px solid #cbd5e1; background:white; color:#0f172a; border-radius:.8rem; outline:none; }
  .profile-input:focus-visible { border-color:#0f766e; box-shadow:0 0 0 3px #ccfbf1; }
</style>
