<script lang="ts">
  import { api } from '../lib/api';
  let { onSuccess }: { onSuccess: (user: any, token: string) => void } = $props();
  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let phone = $state('');
  let address = $state('');
  let city = $state('');
  let province = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const result = mode === 'login'
        ? await api.customerLogin({ email, password })
        : await api.register({ name, email, password, phone, address, city, province });
      password = '';
      onSuccess(result.user, result.access_token);
    } catch (e) {
      error = e instanceof Error ? e.message : 'No se pudo completar la operación';
    } finally { busy = false; }
  }
</script>

<div class="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
  <section class="w-full max-w-lg rounded-2xl bg-white border border-gray-200 shadow-sm p-7 sm:p-9">
    <div class="text-center mb-8">
      <div class="inline-flex w-12 h-12 rounded-xl bg-energia-600 text-white font-bold items-center justify-center">EV</div>
      <h1 class="text-3xl font-bold text-gray-900 mt-3">Energía Vital</h1>
      <p class="text-gray-600 mt-2">Tu espacio para consultar equipos, solicitar servicios y dar seguimiento a tus citas.</p>
    </div>
    <div class="flex gap-2 mb-6" role="group" aria-label="Acceso">
      <button type="button" class="flex-1 py-2 rounded-lg {mode === 'login' ? 'bg-energia-600 text-white' : 'bg-gray-100 text-gray-700'}" onclick={() => { mode = 'login'; error = ''; }}>Entrar</button>
      <button type="button" class="flex-1 py-2 rounded-lg {mode === 'register' ? 'bg-energia-600 text-white' : 'bg-gray-100 text-gray-700'}" onclick={() => { mode = 'register'; error = ''; }}>Crear cuenta</button>
    </div>
    <form onsubmit={submit} class="space-y-4">
      {#if mode === 'register'}
        <label class="block text-sm font-medium">Nombre y apellidos
          <input required minlength="3" maxlength="120" autocomplete="name" bind:value={name} class="mt-1 w-full border rounded-lg p-3" />
        </label>
      {/if}
      <label class="block text-sm font-medium">Correo electrónico
        <input type="email" required autocomplete="email" bind:value={email} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      {#if mode === 'register'}
        <label class="block text-sm font-medium">Teléfono de contacto
          <input type="tel" required autocomplete="tel" placeholder="+53 ..." bind:value={phone} class="mt-1 w-full border rounded-lg p-3" />
        </label>
        <label class="block text-sm font-medium">Dirección de servicio (calle, número y referencia)
          <input required minlength="6" autocomplete="street-address" bind:value={address} class="mt-1 w-full border rounded-lg p-3" />
        </label>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block text-sm font-medium">Municipio
            <input required bind:value={city} class="mt-1 w-full border rounded-lg p-3" />
          </label>
          <label class="block text-sm font-medium">Provincia
            <input required bind:value={province} class="mt-1 w-full border rounded-lg p-3" />
          </label>
        </div>
      {/if}
      <label class="block text-sm font-medium">Contraseña
        <input type="password" required minlength={mode === 'register' ? 10 : undefined} autocomplete={mode === 'register' ? 'new-password' : 'current-password'} bind:value={password} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      {#if mode === 'register'}
        <p class="text-xs text-gray-600">Usaremos tus datos solo para gestionar tu cuenta, solicitudes, visitas y comunicación comercial. Tu teléfono se guarda, pero no se considera verificado hasta confirmarlo por un canal autorizado.</p>
      {/if}
      {#if error}<p role="alert" class="text-red-700 text-sm">{error}</p>{/if}
      <button type="submit" disabled={busy} class="w-full rounded-lg bg-energia-600 hover:bg-energia-700 disabled:opacity-50 text-white py-3 font-semibold">
        {busy ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : 'Crear mi cuenta'}
      </button>
    </form>
    <p class="text-xs text-center text-gray-500 mt-6">Acceso requerido para usar los servicios de Energía Vital.</p>
  </section>
</div>
