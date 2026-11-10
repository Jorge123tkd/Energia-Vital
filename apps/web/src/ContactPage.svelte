<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let settings: Record<string, string> = $state({});
  let type = $state('consultation');
  let title = $state('');
  let description = $state('');
  let preferredDate = $state('');
  let message = $state('');
  let error = $state('');
  let busy = $state(false);
  onMount(async () => {
    try { settings = (await api.getSettings()).settings ?? {}; } catch { /* Los datos de contacto son opcionales. */ }
    const params = new URLSearchParams(window.location.search);
    if (params.has('product')) {
      type = 'consultation'; title = `Consulta sobre ${params.get('product')}`;
      description = `Solicito información sobre el equipo ${params.get('product')}: disponibilidad, precio y compatibilidad.`;
    } else if (params.has('service')) {
      type = 'installation'; title = `Servicio: ${params.get('service')}`;
      description = `Quiero información y presupuesto para el servicio ${params.get('service')}.`;
    } else if (params.has('reference')) {
      type = 'installation'; title = `Proyecto similar a ${params.get('reference')}`;
      description = `Solicito evaluación para un proyecto semejante a ${params.get('reference')}.`;
    } else if (params.has('power')) {
      type = 'installation'; title = 'Evaluación de sistema solar';
      description = `Asesor solar: potencia ${params.get('power')} W, energía ${params.get('dailyEnergy')} kWh, batería ${params.get('batteryCapacity')} kWh, inversor ${params.get('inverterMin')} W, sistema ${params.get('pvPower')} kWp, ${params.get('panelCount')} paneles. Equipo existente: ${params.get('existingEquipment') || 'No especificado'}.`;
    }
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault(); busy = true; error = ''; message = '';
    try {
      const result = await api.createRequest({ type, title, description, preferred_date: preferredDate || undefined });
      message = `Tu solicitud se registró correctamente. Número de referencia: ${result.id}`;
      title = ''; description = ''; preferredDate = '';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo enviar la solicitud'; }
    finally { busy = false; }
  }
</script>

<div class="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 py-8 sm:py-12 px-3 sm:px-6">
  <div class="max-w-6xl mx-auto space-y-7">
    <header class="max-w-3xl">
      <span class="text-xs uppercase tracking-[.2em] font-extrabold text-teal-700">Bonaire · Atención personalizada</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">¿En qué podemos ayudarte?</h1>
      <p class="text-slate-600 mt-3 leading-relaxed">Solicita una instalación, consulta sobre equipos o pide una visita técnica. Tu solicitud quedará vinculada a los datos de tu perfil.</p>
    </header>
    <div class="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)] gap-5 lg:gap-7 items-start">
      <form onsubmit={submit} class="bg-white rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5 sm:p-8 space-y-5 min-w-0">
        <div class="flex items-center gap-3 mb-2"><span class="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-extrabold">01</span><div><h2 class="text-xl font-bold text-slate-900">Cuéntanos tu solicitud</h2><p class="text-xs text-slate-500">Los campos obligatorios están señalados.</p></div></div>
        <label class="contact-label">Tipo de solicitud *
          <select bind:value={type} class="contact-control">
            <option value="consultation">Consulta sobre equipos</option>
            <option value="installation">Instalación solar</option>
            <option value="repair">Reparación</option>
            <option value="maintenance">Mantenimiento</option>
            <option value="complaint">Reclamación</option>
            <option value="suggestion">Sugerencia</option>
          </select>
        </label>
        <label class="contact-label">Asunto *
          <input required minlength="3" maxlength="180" bind:value={title} class="contact-control" placeholder="Ej. Instalación solar para mi vivienda" />
        </label>
        <label class="contact-label">Descripción *
          <textarea required minlength="6" maxlength="3000" rows="5" bind:value={description} class="contact-control resize-y" placeholder="Cuéntanos lo que necesitas, tus equipos y cualquier detalle importante…"></textarea>
        </label>
        <label class="contact-label">Fecha preferida (opcional)
          <input type="date" bind:value={preferredDate} class="contact-control" />
        </label>
        {#if error}<p role="alert" class="text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 text-sm">{error}</p>{/if}
        {#if message}<p role="status" class="text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-semibold break-words">{message}</p>{/if}
        <button disabled={busy} type="submit" class="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white px-5 py-3.5 font-extrabold rounded-xl shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-600">
          {busy ? 'Enviando solicitud…' : 'Enviar mi solicitud →'}
        </button>
        <p class="text-xs text-slate-500">No se confirma una cita automáticamente. Nuestro equipo revisará tu solicitud.</p>
      </form>
      <aside class="bg-slate-950 text-white rounded-3xl p-5 sm:p-7 space-y-5 shadow-lg min-w-0">
        <div><span class="text-xs font-bold uppercase tracking-wider text-teal-300">Estamos para ayudarte</span><h2 class="text-2xl font-bold mt-2">Contacta a Bonaire</h2></div>
        <p class="text-sm text-slate-300 leading-relaxed">Asesoramiento para paneles solares, baterías, inversores, instalaciones y mantenimiento.</p>
        {#if settings.business_phone}
          <div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Teléfono / WhatsApp</p><a class="text-white font-semibold hover:text-teal-200 break-words" href={'https://wa.me/' + settings.business_phone.replace(/\D/g,'')} target="_blank" rel="noopener noreferrer">{settings.business_phone}</a></div>
        {/if}
        {#if settings.business_email}
          <div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Correo electrónico</p><a href={'mailto:' + settings.business_email} class="text-white hover:text-teal-200 break-all">{settings.business_email}</a></div>
        {/if}
        {#if settings.business_address}<div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Dirección</p><p class="text-sm text-slate-100">{settings.business_address}</p></div>{/if}
        {#if settings.business_hours}<div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Horario</p><p class="text-sm text-slate-100">{settings.business_hours}</p></div>{/if}
        {#if settings.youtube_channel_url}<a target="_blank" rel="noopener noreferrer" class="inline-block text-teal-300 font-semibold underline text-sm" href={settings.youtube_channel_url}>Nuestro canal de YouTube</a>{/if}
        <a class="block text-center w-full rounded-xl border border-teal-400/50 text-teal-100 hover:bg-teal-950 px-4 py-3 text-sm font-bold" href="/asesor-solar">¿No sabes qué sistema necesitas? Prueba el asesor solar</a>
      </aside>
    </div>
  </div>
</div>
<style>
  .contact-label { display:block; color:#334155; font-size:.875rem; font-weight:650; }
  .contact-control { display:block; width:100%; min-width:0; margin-top:.45rem; padding:.88rem 1rem; border:1px solid #cbd5e1; border-radius:.85rem; background:#fff; color:#0f172a; outline:none; }
  .contact-control:focus-visible { border-color:#0f766e; box-shadow:0 0 0 3px #ccfbf1; }
</style>
