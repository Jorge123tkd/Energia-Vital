<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  let settings: Record<string, string> = $state({});
  let serviceId = $state('');
  let services: {id:string;name:string;description?:string}[] = $state([]);
  let serviceLoading = $state(true);
  let serviceError = $state('');
  let selectedService = $derived(services.find(service => service.id === serviceId));
  function selectService(id: string) {
    serviceId = id;
    if (selectedService && (!title.trim() || title.startsWith('Solicitud de ')))
      title = 'Solicitud de ' + selectedService.name;
  }
  type Attachment = { file: File; preview: string };
  let attachments: Attachment[] = $state([]);
  function pickImages(files: FileList | null) {
    if (!files) return;
    error = '';
    for (const file of Array.from(files)) {
      if (attachments.length >= 5) { error = 'Puedes adjuntar hasta cinco fotografías.'; break; }
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8*1024*1024 || !file.size) {
        error = 'Las fotos deben ser JPG, PNG o WebP, de hasta 8 MB cada una.';
        continue;
      }
      attachments = [...attachments, { file, preview: URL.createObjectURL(file) }];
    }
  }
  function discardImage(index: number) {
    URL.revokeObjectURL(attachments[index].preview);
    attachments = attachments.filter((_,i) => i !== index);
  }
  function clearImages() {
    attachments.forEach(a => URL.revokeObjectURL(a.preview));
    attachments = [];
  }

  let title = $state('');
  let description = $state('');
  let preferredDate = $state('');
  let message = $state('');
  let error = $state('');
  let busy = $state(false);
  onMount(() => {
    void (async () => {
      const [config, available] = await Promise.allSettled([api.getSettings(), api.getServices()]);
      if (config.status === 'fulfilled') settings = config.value.settings ?? {};
      if (available.status === 'fulfilled') {
        services = available.value.services ?? [];
        if (!services.length) serviceError = 'Por el momento no hay servicios publicados. Prueba desde el catálogo o contáctanos directamente.';
      } else serviceError = 'No pudimos cargar los servicios. Recarga la página antes de enviar la solicitud.';
      serviceLoading = false;

      const params = new URLSearchParams(window.location.search);
      const indicatedId = params.get('service_id');
      const indicatedName = params.get('service');
      const matched = services.find(s => s.id === indicatedId || (indicatedName && s.name === indicatedName));
      serviceId = matched?.id ?? services[0]?.id ?? '';
      if (params.has('product')) {
        title = 'Consulta sobre ' + params.get('product');
        description = 'Solicito información sobre el equipo ' + params.get('product') + ': disponibilidad, precio y compatibilidad.';
      } else if (matched) {
        title = 'Solicitud de ' + matched.name;
        description = 'Necesito información y presupuesto para el servicio ' + matched.name + '.';
      } else if (params.has('reference')) {
        title = 'Proyecto similar a ' + params.get('reference');
        description = 'Solicito evaluación para un proyecto semejante a ' + params.get('reference') + '.';
      } else if (params.has('power')) {
        title = 'Evaluación de sistema solar';
        description = `Asesor solar: potencia ${params.get('power')} W, energía ${params.get('dailyEnergy')} kWh, batería ${params.get('batteryCapacity')} kWh, inversor ${params.get('inverterMin')} W, sistema ${params.get('pvPower')} kWp, ${params.get('panelCount')} paneles. Equipo existente: ${params.get('existingEquipment') || 'No especificado'}.`;
      } else if (services.length) title = 'Solicitud de ' + services[0].name;
    })();
    return () => clearImages();
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault(); busy = true; error = ''; message = '';
    try {
      if (!serviceId || !selectedService) throw new Error('Selecciona uno de los servicios disponibles.');
      const result = await api.createRequest({
        service_id: serviceId, title, description, preferred_date: preferredDate || undefined
      });
      let uploaded = 0;
      for (const entry of attachments) {
        try { await api.uploadRequestImage(result.id, entry.file); uploaded += 1; }
        catch { /* La solicitud ya existe: informar de cualquier foto no subida, sin crear otra solicitud. */ }
      }
      const total = attachments.length;
      message = `Solicitud registrada. Referencia: ${result.id}.` +
        (total ? ` Fotografías guardadas: ${uploaded} de ${total}.` : '') +
        (uploaded < total ? ' Algunas fotos no se cargaron; puedes añadirlas desde Mis solicitudes.' : '');
      clearImages(); title = ''; description = ''; preferredDate = '';
    } catch (e) { error = e instanceof Error ? e.message : 'No se pudo enviar la solicitud'; }
    finally { busy = false; }
  }
</script>

<div class="min-h-[calc(100vh-6rem)] bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 py-8 sm:py-12 px-3 sm:px-6">
  <div class="max-w-6xl mx-auto space-y-7">
    <header class="max-w-3xl">
      <span class="text-xs uppercase tracking-[.2em] font-extrabold text-teal-700">Bonaire · Atención personalizada</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">¿En qué podemos ayudarte?</h1>
      <p class="text-slate-600 mt-3 leading-relaxed">Elige uno de los servicios publicados por Bonaire y descríbenos lo que necesitas. La solicitud quedará vinculada a tu cuenta.</p>
    </header>
    <div class="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)] gap-5 lg:gap-7 items-start">
      <form onsubmit={submit} class="bg-white rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50 p-5 sm:p-8 space-y-5 min-w-0">
        <div class="flex items-center gap-3 mb-2"><span class="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-extrabold">01</span><div><h2 class="text-xl font-bold text-slate-900">Cuéntanos tu solicitud</h2><p class="text-xs text-slate-500">Los campos obligatorios están señalados.</p></div></div>
        <label class="contact-label">Servicio que necesitas *
          <select required value={serviceId} disabled={serviceLoading || !services.length}
            onchange={e => selectService(e.currentTarget.value)} class="contact-control">
            {#if !serviceId}<option value="" disabled>Selecciona un servicio</option>{/if}
            {#each services as item (item.id)}
              <option value={item.id}>{item.name}</option>
            {/each}
          </select>
        </label>
        {#if serviceLoading}<p class="text-xs text-slate-500">Cargando servicios publicados…</p>{/if}
        {#if serviceError}<p role="alert" class="text-sm text-red-700">{serviceError}</p>{/if}
        {#if selectedService?.description}
          <p class="rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-900">{selectedService.description}</p>
        {/if}
        <label class="contact-label">Asunto *
          <input required minlength="3" maxlength="180" bind:value={title} class="contact-control" placeholder="Ej. Instalación solar para mi vivienda" />
        </label>
        <label class="contact-label">Descripción *
          <textarea required minlength="6" maxlength="3000" rows="5" bind:value={description} class="contact-control resize-y" placeholder="Cuéntanos lo que necesitas, tus equipos y cualquier detalle importante…"></textarea>
        </label>
        <label class="contact-label">Fecha preferida (opcional)
          <input type="date" bind:value={preferredDate} class="contact-control" />
        </label>
        <fieldset class="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
          <legend class="text-sm font-extrabold text-slate-800 px-2">Fotografías de tu solicitud (opcional)</legend>
          <p class="text-xs sm:text-sm text-slate-600">
            Puedes adjuntar imágenes para explicar mejor el servicio que necesitas.
          </p>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp"
            class="block w-full text-xs sm:text-sm text-slate-700 file:rounded-lg file:border-0 file:bg-teal-700 file:text-white file:font-bold file:px-4 file:py-2.5 file:mr-3"
            aria-label="Seleccionar fotografías de la solicitud"
            onchange={e => { pickImages(e.currentTarget.files); e.currentTarget.value = ''; }} />
          <p class="text-xs text-slate-500">Hasta 5 imágenes JPG, PNG o WebP de 8 MB cada una. Solo tú y el personal autorizado pueden verlas.</p>
          {#if attachments.length}
            <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {#each attachments as entry, i (entry.preview)}
                <div class="relative min-w-0 rounded-xl overflow-hidden border border-slate-200 bg-white">
                  <img src={entry.preview} alt={'Foto seleccionada '+(i+1)} class="w-full h-24 object-cover" />
                  <button type="button" onclick={() => discardImage(i)} aria-label={'Quitar fotografía '+(i+1)}
                    class="absolute top-1 right-1 bg-white/95 shadow rounded-lg w-7 h-7 text-red-700 font-bold">✕</button>
                </div>
              {/each}
            </div>
          {/if}
        </fieldset>
        {#if error}<p role="alert" class="text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 text-sm">{error}</p>{/if}
        {#if message}<p role="status" class="text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-semibold break-words">{message}</p>{/if}
        <button disabled={busy || serviceLoading || !serviceId} type="submit" class="w-full bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white px-5 py-3.5 font-extrabold rounded-xl shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-600">
          {busy ? 'Enviando solicitud…' : 'Enviar mi solicitud →'}
        </button>
        <p class="text-xs text-slate-500">No se confirma una cita automáticamente. Nuestro equipo revisará tu solicitud.</p>
      </form>
      <aside class="bg-slate-950 text-white rounded-3xl p-5 sm:p-7 space-y-5 shadow-lg min-w-0">
        <div><span class="text-xs font-bold uppercase tracking-wider text-teal-300">Estamos para ayudarte</span><h2 class="text-2xl font-bold mt-2">Contacta a Bonaire</h2></div>
        <p class="text-sm text-slate-300 leading-relaxed">Asesoramiento para paneles solares, baterías, inversores, instalaciones y mantenimiento.</p>
        {#if settings.business_phone}
          <div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Atención del equipo · Teléfono / WhatsApp</p><a class="text-white font-semibold hover:text-teal-200 break-words" href={'https://wa.me/' + settings.business_phone.replace(/\D/g,'')} target="_blank" rel="noopener noreferrer">{settings.business_phone}</a></div>
        {/if}
        {#if settings.business_email}
          <div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Correo electrónico</p><a href={'mailto:' + settings.business_email} class="text-white hover:text-teal-200 break-all">{settings.business_email}</a></div>
        {/if}
        {#if settings.business_address}<div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Dirección</p><p class="text-sm text-slate-100">{settings.business_address}</p></div>{/if}
        {#if settings.business_hours}<div class="border-t border-white/15 pt-4"><p class="text-xs text-teal-300 font-bold mb-1">Horario</p><p class="text-sm text-slate-100">{settings.business_hours}</p></div>{/if}
        {#if settings.bot_whatsapp_url || settings.bot_telegram_url}
          <section class="border-t border-white/15 pt-4 space-y-2">
            <p class="text-xs text-teal-300 font-bold">Asistente automático (canal independiente)</p>
            {#if settings.bot_whatsapp_url}<a class="block rounded-xl border border-teal-400/50 px-3 py-2.5 text-sm text-white font-semibold" href={settings.bot_whatsapp_url} target="_blank" rel="noopener noreferrer">Abrir bot de WhatsApp</a>{/if}
            {#if settings.bot_telegram_url}<a class="block rounded-xl border border-teal-400/50 px-3 py-2.5 text-sm text-white font-semibold" href={settings.bot_telegram_url} target="_blank" rel="noopener noreferrer">Abrir bot de Telegram</a>{/if}
          </section>
        {/if}
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
