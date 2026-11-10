<script lang="ts">
  import { api } from '../lib/api';
  let { onSuccess, initialMode = 'login' }: { onSuccess: (user: any, token: string) => void; initialMode?: 'login' | 'register' } = $props();
  let mode = $state<'login' | 'register'>('login');
  $effect(() => { mode = initialMode; error = ''; });
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
        ? await api.signIn({ email, password })
        : await api.register({ name, email, password, phone, address, city, province });
      password = '';
      onSuccess(result.user, result.access_token);
    } catch (e) {
      error = e instanceof Error ? e.message : 'No se pudo completar la operación';
    } finally { busy = false; }
  }
</script>

<div class="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 px-4 py-10 sm:py-16 flex justify-center items-start">
  <div class="w-full max-w-2xl">
    <div class="text-center mb-7">
      <span class="inline-flex w-14 h-14 bg-teal-700 rounded-2xl text-white shadow-lg justify-center items-center text-2xl font-black">B</span>
      <p class="text-xs uppercase tracking-[.24em] text-teal-700 font-bold mt-4">Bonaire · Área personal</p>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
        {mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
      </h1>
      <p class="text-slate-600 text-sm sm:text-base mt-3 max-w-lg mx-auto">
        {mode === 'login' ? 'Entra para consultar tus solicitudes, recibir notificaciones y acceder al asesor solar.' :
          'Registra tus datos para solicitar instalaciones y servicios de forma segura.'}
      </p>
    </div>
    <section class="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-200/60 p-5 sm:p-9">
      <div class="grid grid-cols-2 bg-slate-100 p-1.5 rounded-2xl gap-2 mb-7" role="group" aria-label="Acceso">
        <button type="button" class="rounded-xl py-3 text-sm font-bold transition {mode === 'login' ? 'bg-teal-700 text-white shadow-md' : 'text-slate-600 hover:bg-white'}"
          onclick={() => { mode = 'login'; error = ''; }}>Iniciar sesión</button>
        <button type="button" class="rounded-xl py-3 text-sm font-bold transition {mode === 'register' ? 'bg-teal-700 text-white shadow-md' : 'text-slate-600 hover:bg-white'}"
          onclick={() => { mode = 'register'; error = ''; }}>Crear cuenta</button>
      </div>
      <form onsubmit={submit} class="space-y-4">
        {#if mode === 'register'}
          <label class="field-label">Nombre y apellidos
            <input required minlength="3" maxlength="120" autocomplete="name" bind:value={name} class="field-control" placeholder="Tu nombre completo" />
          </label>
        {/if}
        <label class="field-label">Correo electrónico
          <input type="email" required autocomplete="email" bind:value={email} class="field-control" placeholder="tu@correo.com" />
        </label>
        {#if mode === 'register'}
          <label class="field-label">Teléfono de contacto
            <input type="tel" required autocomplete="tel" placeholder="+53 ..." bind:value={phone} class="field-control" />
          </label>
          <label class="field-label">Dirección del servicio
            <input required minlength="6" autocomplete="street-address" bind:value={address} class="field-control" placeholder="Calle, número y referencia" />
          </label>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="field-label">Municipio
              <input required bind:value={city} class="field-control" />
            </label>
            <label class="field-label">Provincia
              <input required bind:value={province} class="field-control" />
            </label>
          </div>
        {/if}
        <label class="field-label">Contraseña
          <input type="password" required minlength={mode === 'register' ? 10 : undefined}
            autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
            bind:value={password} class="field-control" placeholder={mode === 'register' ? 'Mínimo 10 caracteres' : 'Tu contraseña'} />
        </label>
        {#if mode === 'register'}
          <p class="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">
            Usaremos estos datos para gestionar solicitudes y visitas. Tu teléfono no se considera verificado hasta confirmarlo por un canal autorizado.
          </p>
        {/if}
        {#if error}<p role="alert" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>{/if}
        <button type="submit" disabled={busy} class="w-full bg-teal-700 hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 text-white rounded-xl py-3.5 font-bold shadow-sm disabled:opacity-50">
          {busy ? 'Procesando…' : mode === 'login' ? 'Entrar en Bonaire' : 'Crear mi cuenta'}
        </button>
      </form>
      <p class="text-xs text-center text-slate-500 mt-6">
        También puedes entrar aquí con una cuenta de administrador o moderador. El sistema reconocerá tus permisos.
      </p>
    </section>
  </div>
</div>
<style>
  .field-label { display:block; color:#334155; font-size:.875rem; font-weight:600; }
  .field-control { display:block; width:100%; min-width:0; margin-top:.45rem; padding:.85rem 1rem; border-radius:.75rem; border:1px solid #cbd5e1; background:#fff; color:#0f172a; outline:none; }
  .field-control:focus-visible { border-color:#0f766e; box-shadow:0 0 0 3px #ccfbf1; }
</style>