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
<div class="max-w-5xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-3">Contactar a Bonaire</h1>
  <p class="text-gray-600 mb-7">Tu solicitud quedará vinculada a tu cuenta, teléfono y dirección guardados en «Mi perfil».</p>
  <div class="grid lg:grid-cols-2 gap-8">
    <form onsubmit={submit} class="bg-white border rounded-xl p-6 space-y-4">
      <label class="block font-medium">Tipo de solicitud
        <select bind:value={type} class="mt-1 block w-full border rounded-lg p-3">
          <option value="consultation">Consulta</option><option value="installation">Instalación solar</option>
          <option value="repair">Reparación</option><option value="maintenance">Mantenimiento</option>
          <option value="complaint">Reclamación</option><option value="suggestion">Sugerencia</option>
        </select>
      </label>
      <label class="block font-medium">Asunto<input required minlength="3" maxlength="180" bind:value={title} class="mt-1 block w-full border rounded-lg p-3" /></label>
      <label class="block font-medium">Descripción<textarea required minlength="6" maxlength="3000" rows="5" bind:value={description} class="mt-1 block w-full border rounded-lg p-3"></textarea></label>
      <label class="block font-medium">Fecha preferida (opcional)<input type="date" bind:value={preferredDate} class="mt-1 block w-full border rounded-lg p-3" /></label>
      {#if error}<p role="alert" class="text-red-700">{error}</p>{/if}
      {#if message}<p role="status" class="text-green-700 break-words">{message}</p>{/if}
      <button disabled={busy} type="submit" class="bg-energia-600 hover:bg-energia-700 text-white px-5 py-3 rounded-lg w-full">{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
    </form>
    <aside class="bg-white border rounded-xl p-6 space-y-4">
      <h2 class="text-xl font-semibold">Información comercial</h2>
      <p>Atendemos consultas sobre paneles, baterías, inversores, instalación y mantenimiento.</p>
      {#if settings.business_phone}<p>Teléfono: {settings.business_phone}</p>{/if}
      {#if settings.business_email}<p>Correo: {settings.business_email}</p>{/if}
      {#if settings.business_address}<p>Dirección: {settings.business_address}</p>{/if}
      {#if settings.youtube_channel_url}<a target="_blank" rel="noopener noreferrer" class="text-energia-600 underline" href={settings.youtube_channel_url}>Nuestro canal de YouTube</a>{/if}
      <p class="text-sm text-gray-600">La visita técnica y los precios finales se confirmarán individualmente.</p>
    </aside>
  </div>
</div>
