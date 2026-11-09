<script lang="ts">
  import { api } from '../lib/api';
  let { user, onUpdate }: { user: any; onUpdate: (user: any) => void } = $props();
  let name = $state(user.name ?? '');
  let phone = $state(user.phone ?? '');
  let address = $state(user.address ?? '');
  let city = $state(user.city ?? '');
  let province = $state(user.province ?? '');
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
<div class="max-w-3xl mx-auto py-8 space-y-8">
  <header><h1 class="text-3xl font-bold">Mi perfil</h1><p class="text-gray-600 mt-2">Estos datos se usarán en las visitas y solicitudes vinculadas a tu cuenta.</p></header>
  <form onsubmit={save} class="bg-white border rounded-xl p-6 space-y-4">
    <p class="text-sm text-gray-600">Correo de acceso: <strong>{user.email}</strong></p>
    <label class="block">Nombre completo<input required minlength="3" bind:value={name} class="mt-1 w-full border rounded-lg p-3" /></label>
    <label class="block">Teléfono<input type="tel" required bind:value={phone} class="mt-1 w-full border rounded-lg p-3" /></label>
    <label class="block">Dirección<input required minlength="6" bind:value={address} class="mt-1 w-full border rounded-lg p-3" /></label>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="block">Municipio<input required bind:value={city} class="mt-1 w-full border rounded-lg p-3" /></label>
      <label class="block">Provincia<input required bind:value={province} class="mt-1 w-full border rounded-lg p-3" /></label>
    </div>
    <button disabled={busy} class="bg-energia-600 text-white rounded-lg px-5 py-3">Guardar perfil</button>
  </form>
  <form onsubmit={change} class="bg-white border rounded-xl p-6 space-y-4">
    <h2 class="font-semibold text-xl">Cambiar contraseña</h2>
    <label class="block">Contraseña actual<input required type="password" autocomplete="current-password" bind:value={currentPassword} class="mt-1 w-full border rounded-lg p-3" /></label>
    <label class="block">Nueva contraseña (mínimo 10 caracteres)<input required type="password" minlength="10" autocomplete="new-password" bind:value={newPassword} class="mt-1 w-full border rounded-lg p-3" /></label>
    <button disabled={busy} class="bg-energia-600 text-white rounded-lg px-5 py-3">Cambiar contraseña</button>
  </form>
  {#if error}<p role="alert" class="text-red-700">{error}</p>{/if}
  {#if success}<p role="status" class="text-green-700">{success}</p>{/if}
</div>
