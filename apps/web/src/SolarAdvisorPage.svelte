<script lang="ts">
  type Phase = 'monofasica' | 'bifasica' | 'trifasica';
  type Origin = 'equipos' | 'medicion' | 'acometida';
  type Device = { id: number; name: string; watts: number; units: number; hours: number };
  type Result = { power: number; daily: number; battery: number; inverter: number; pv: number; panelCount: number; panelWatts: number };
  let step = $state(0);
  let phase = $state<Phase>('monofasica');
  let origin = $state<Origin>('equipos');
  let voltage = $state(220);
  let amps = $state(0);
  let powerFactor = $state(0.85);
  let hoursDaily = $state(6);
  let autonomyHours = $state(5);
  let peakSunHours = $state(4.5);
  let panelWatts = $state(450);
  let existingEquipment = $state('');
  let devices = $state<Device[]>([{ id: 1, name: '', watts: 0, units: 1, hours: 5 }]);
  let nextId = 2;
  let result = $state<Result | null>(null);
  let error = $state('');
  let copied = $state(false);
  const labels = ['Instalación', 'Origen de los datos', 'Consumo', 'Autonomía y sol', 'Resumen'];
  function addDevice() {
    devices = [...devices, { id: nextId++, name: '', watts: 0, units: 1, hours: 5 }];
  }
  function removeDevice(id: number) {
    if (devices.length > 1) devices = devices.filter(d => d.id !== id);
  }
  function value(n: number, min: number, max: number) { return Number.isFinite(Number(n)) && Number(n) >= min && Number(n) <= max; }
  function loadEstimates() {
    if (origin === 'equipos') {
      const power = devices.reduce((sum, d) => sum + Number(d.watts) * Number(d.units), 0);
      const daily = devices.reduce((sum, d) => sum + Number(d.watts) * Number(d.units) * Number(d.hours), 0) / 1000;
      return { power, daily };
    }
    const multiplier = phase === 'trifasica' ? Math.sqrt(3) : 1;
    const power = Number(voltage) * Number(amps) * Number(powerFactor) * multiplier;
    return { power, daily: power * Number(hoursDaily) / 1000 };
  }
  let estimates = $derived.by(() => loadEstimates());
  function validate(target: number): boolean {
    error = '';
    if (target === 2 && origin === 'acometida') {
      error = 'El valor del interruptor principal no representa el consumo real. Elige «Lista de equipos» o «Medición de cargas» para continuar.';
      return false;
    }
    if (target === 3) {
      if (origin === 'equipos' && (!devices.length || devices.some(d =>
        !d.name.trim() || !value(d.watts, 1, 50000) || !value(d.units, 1, 100) || !value(d.hours, 0.1, 24)))) {
        error = 'Completa cada equipo con nombre, potencia (W), cantidad y horas al día.';
        return false;
      }
      if (origin === 'medicion' && (!value(voltage, 50, 600) || !value(amps, 0.1, 1000) ||
        !value(powerFactor, 0.1, 1) || !value(hoursDaily, 0.1, 24))) {
        error = 'Revisa voltaje, corriente real de cargas, factor de potencia y horas diarias.';
        return false;
      }
      const load = loadEstimates();
      if (!Number.isFinite(load.power) || !Number.isFinite(load.daily) || load.power <= 0 || load.daily <= 0 || load.power > 250000 || load.daily > 1000) {
        error = 'Los consumos parecen demasiado altos. Revisa la potencia y las unidades.';
        return false;
      }
    }
    if (target === 4 && (!value(autonomyHours, 0.5, 72) || !value(peakSunHours, 1, 8) || !value(panelWatts, 100, 900))) {
      error = 'Revisa la autonomía, las horas solares y la potencia del panel.';
      return false;
    }
    return true;
  }
  function next() {
    if (step >= 4 || !validate(step + 1)) return;
    step += 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function back() {
    if (step > 0) step -= 1;
    result = null;
    error = '';
  }
  function calculate() {
    if (!validate(3) || !validate(4)) return;
    const load = loadEstimates();
    const battery = (load.power / 1000) * Number(autonomyHours) / (0.8 * 0.9);
    const pv = load.daily / (Number(peakSunHours) * 0.75);
    const inverter = load.power * 1.25;
    if (![battery, pv, inverter].every(Number.isFinite)) {
      error = 'No pudimos calcular con esos datos. Revisa tus valores.';
      return;
    }
    result = { power: load.power, daily: load.daily, battery, pv, inverter,
      panelWatts: Number(panelWatts), panelCount: Math.ceil(pv * 1000 / Number(panelWatts)) };
    step = 5;
    error = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function requestAssessment() {
    if (!result) return;
    const query = new URLSearchParams({
      power: result.power.toFixed(0), dailyEnergy: result.daily.toFixed(2),
      batteryCapacity: result.battery.toFixed(2), inverterMin: result.inverter.toFixed(0),
      pvPower: result.pv.toFixed(2), panelCount: String(result.panelCount),
      existingEquipment: existingEquipment || (origin === 'equipos' ? devices.map(d => d.name).join(', ') : ''),
      phase, measurement: origin,
    });
    window.location.href = `/contacto?${query}`;
  }
  async function copySummary() {
    if (!result) return;
    const text = `Bonaire · Asesor solar orientativo\nPotencia simultánea: ${result.power.toFixed(0)} W\nConsumo diario: ${result.daily.toFixed(2)} kWh\nBatería nominal: ${result.battery.toFixed(2)} kWh\nInversor mínimo: ${result.inverter.toFixed(0)} W\nPaneles: ${result.panelCount} de ${result.panelWatts} W\nValidar con técnico antes de comprar.`;
    try { await navigator.clipboard.writeText(text); copied = true; }
    catch { error = 'Tu navegador no permitió copiar. Puedes seleccionar los resultados manualmente.'; }
  }
  function reset() { step = 0; result = null; error = ''; copied = false; }
</script>

<div class="w-full max-w-4xl mx-auto px-1 sm:px-4 py-5 sm:py-10">
  <header class="mb-6">
    <span class="text-xs font-bold tracking-widest uppercase text-teal-700">Bonaire · Herramienta gratuita</span>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">Tu asesor solar, paso a paso</h1>
    <p class="text-slate-600 mt-3 max-w-2xl">Responde una pregunta a la vez. Te ayudaremos a estimar consumos, baterías, inversor y paneles sin llenar un formulario enorme.</p>
  </header>
  <section class="bg-white border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
    <div class="px-5 sm:px-8 pt-6 pb-5 border-b border-slate-100 bg-slate-50/70">
      <div class="flex justify-between gap-3 text-sm font-semibold">
        <span class="text-slate-700">{step === 5 ? 'Resultado de tu estudio' : labels[step]}</span>
        <span class="text-teal-700">{step === 5 ? 'Completado' : `Paso ${step + 1} de 5`}</span>
      </div>
      <div class="mt-3 bg-slate-200 h-2 rounded-full overflow-hidden">
        <div class="h-full rounded-full bg-teal-700 transition-all duration-300" style:width={`${step === 5 ? 100 : (step + 1) * 20}%`}></div>
      </div>
      <div class="hidden sm:flex justify-between gap-1 mt-3 text-[11px] text-slate-500">
        {#each labels as label, i}<span class={step === i ? 'text-teal-800 font-bold' : ''}>{i + 1}. {label}</span>{/each}
      </div>
    </div>
    <div class="p-5 sm:p-8">
      {#if step === 0}
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900 mb-2">¿Qué tipo de instalación tienes?</h2>
        <p class="text-sm text-slate-500 mb-6">Selecciona cómo se alimentan tus equipos. No pasa nada si todavía no conoces todos los detalles.</p>
        <div class="grid sm:grid-cols-3 gap-3">
          {#each [
            { id: 'monofasica', title: 'Monofásica', text: 'Una fase y neutro. Habitual en viviendas.' },
            { id: 'bifasica', title: 'Dos líneas / 220 V', text: 'Equipos alimentados entre dos líneas.' },
            { id: 'trifasica', title: 'Trifásica', text: 'Tres fases. Al medir, usa tensión entre líneas.' },
          ] as option}
            <button type="button" aria-pressed={phase === option.id} onclick={() => phase = option.id as Phase}
              class="text-left border-2 rounded-2xl p-4 transition {phase === option.id ? 'border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-teal-300'}">
              <span class="block font-bold text-slate-900">{option.title}</span>
              <span class="block text-sm text-slate-500 mt-2">{option.text}</span>
            </button>
          {/each}
        </div>
      {:else if step === 1}
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900 mb-2">¿Cómo conoces tu consumo?</h2>
        <p class="text-sm text-slate-500 mb-6">Puedes listar los electrodomésticos o usar una lectura real de corriente.</p>
        <div class="space-y-3">
          {#each [
            { id: 'equipos', title: 'Conozco mis equipos', text: 'Añadiré sus potencias en W, cantidades y horas de uso diario. Recomendado si no tienes medidor.' },
            { id: 'medicion', title: 'Tengo una medición real', text: 'Introduciré voltaje, amperios medidos bajo carga y horas de funcionamiento.' },
            { id: 'acometida', title: 'Solo conozco el interruptor general', text: 'Su amperaje es un límite de seguridad, no el consumo de tus equipos.' }
          ] as option}
            <button type="button" aria-pressed={origin === option.id} onclick={() => { origin = option.id as Origin; error = ''; }}
              class="w-full text-left border-2 rounded-2xl p-4 transition {origin === option.id ? 'border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-teal-300'}">
              <span class="block font-bold text-slate-900">{option.title}</span>
              <span class="block text-sm text-slate-500 mt-1">{option.text}</span>
            </button>
          {/each}
        </div>
        {#if origin === 'acometida'}<p class="mt-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-4 text-sm">Para calcular correctamente necesitamos conocer las cargas. Puedes elegir «Conozco mis equipos» aunque los valores sean aproximados.</p>{/if}
      {:else if step === 2}
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900 mb-2">¿Cuánta energía necesitas?</h2>
        {#if origin === 'equipos'}
          <p class="text-sm text-slate-500 mb-5">Añade los equipos que pueden funcionar al mismo tiempo. Usa la potencia de su etiqueta; las horas diarias nos permiten calcular el consumo.</p>
          <div class="space-y-3">
            {#each devices as d (d.id)}
              <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
                <div class="flex justify-between gap-3 items-center">
                  <span class="text-xs font-bold uppercase tracking-wider text-teal-700">Equipo {devices.indexOf(d) + 1}</span>
                  {#if devices.length > 1}<button type="button" class="text-xs font-semibold text-red-700" onclick={() => removeDevice(d.id)}>Quitar</button>{/if}
                </div>
                <label class="block text-sm font-semibold text-slate-700">Nombre del equipo
                  <input class="solar-input" placeholder="Ej. Refrigerador, ventilador" maxlength="100" bind:value={d.name} />
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label class="block text-sm font-semibold text-slate-700">Potencia (W)
                    <input type="number" min="1" max="50000" step="1" class="solar-input" bind:value={d.watts} />
                  </label>
                  <label class="block text-sm font-semibold text-slate-700">Cantidad
                    <input type="number" min="1" max="100" step="1" class="solar-input" bind:value={d.units} />
                  </label>
                  <label class="block text-sm font-semibold text-slate-700 col-span-2 sm:col-span-1">Horas/día
                    <input type="number" min="0.1" max="24" step="0.5" class="solar-input" bind:value={d.hours} />
                  </label>
                </div>
              </div>
            {/each}
          </div>
          <button type="button" onclick={addDevice} class="mt-4 rounded-xl border border-teal-300 text-teal-800 font-bold px-4 py-3 hover:bg-teal-50">+ Añadir otro equipo</button>
          <p class="mt-4 text-xs text-slate-500">Se supone que todos los equipos indicados pueden funcionar simultáneamente; los motores pueden necesitar un inversor más grande por su pico de arranque.</p>
        {:else}
          <p class="text-sm text-slate-500 mb-5">Utiliza los amperios consumidos por las cargas mientras están encendidas, no los amperios nominales del interruptor.</p>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="solar-label">Voltaje de las cargas (V)<input type="number" min="50" max="600" class="solar-input" bind:value={voltage} /></label>
            <label class="solar-label">Corriente medida (A)<input type="number" min="0.1" max="1000" step="0.1" class="solar-input" bind:value={amps} /></label>
            <label class="solar-label">Factor de potencia (0,1–1)<input type="number" min="0.1" max="1" step="0.01" class="solar-input" bind:value={powerFactor} /></label>
            <label class="solar-label">Horas de uso al día<input type="number" min="0.1" max="24" step="0.5" class="solar-input" bind:value={hoursDaily} /></label>
          </div>
        {/if}
      {:else if step === 3}
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Autonomía y energía solar</h2>
        <p class="text-sm text-slate-500 mb-5">¿Cuántas horas quieres alimentar esas cargas durante un apagón? ¿Con cuánto sol cuentas al día?</p>
        <div class="grid sm:grid-cols-2 gap-4">
          <label class="solar-label">Horas de respaldo deseadas
            <input type="number" min="0.5" max="72" step="0.5" class="solar-input" bind:value={autonomyHours} />
            <span class="text-xs text-slate-500 font-normal">Ejemplo: 5 horas sin red eléctrica.</span>
          </label>
          <label class="solar-label">Horas solares pico/día
            <input type="number" min="1" max="8" step="0.5" class="solar-input" bind:value={peakSunHours} />
            <span class="text-xs text-slate-500 font-normal">Valor inicial 4,5; verifica tu ubicación, sombras y estación.</span>
          </label>
          <label class="solar-label">Potencia de cada panel (W)
            <input type="number" min="100" max="900" step="10" class="solar-input" bind:value={panelWatts} />
          </label>
          <label class="solar-label">Equipos existentes (opcional)
            <input type="text" maxlength="300" placeholder="Ej. Inversor 48 V, batería..." class="solar-input" bind:value={existingEquipment} />
          </label>
        </div>
      {:else if step === 4}
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Revisa tus datos</h2>
        <p class="text-sm text-slate-500 mb-5">El resultado será una estimación preliminar, no un diseño eléctrico definitivo.</p>
        <dl class="grid sm:grid-cols-2 gap-3">
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Instalación</dt><dd class="font-bold mt-1">{phase === 'trifasica' ? 'Trifásica' : phase === 'bifasica' ? 'Dos líneas / 220 V' : 'Monofásica'}</dd></div>
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Origen de datos</dt><dd class="font-bold mt-1">{origin === 'equipos' ? 'Listado de equipos' : 'Medición real'}</dd></div>
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Potencia simultánea</dt><dd class="font-bold mt-1">{estimates.power.toFixed(0)} W</dd></div>
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Energía diaria</dt><dd class="font-bold mt-1">{estimates.daily.toFixed(2)} kWh</dd></div>
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Respaldo</dt><dd class="font-bold mt-1">{autonomyHours} horas</dd></div>
          <div class="bg-slate-50 rounded-xl p-4"><dt class="text-xs text-slate-500">Sol considerado</dt><dd class="font-bold mt-1">{peakSunHours} horas solares pico</dd></div>
        </dl>
      {:else if step === 5 && result}
        <h2 class="text-2xl font-bold text-slate-900 mb-2">Tu estimación solar</h2>
        <p class="text-sm text-slate-600 mb-6">Estos son los valores aproximados para orientar una consulta técnica en Bonaire.</p>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {#each [
            { label: 'Potencia simultánea', value: result.power.toFixed(0) + ' W' },
            { label: 'Consumo diario', value: result.daily.toFixed(2) + ' kWh' },
            { label: 'Batería nominal', value: result.battery.toFixed(2) + ' kWh' },
            { label: 'Inversor orientativo', value: result.inverter.toFixed(0) + ' W' },
            { label: 'Potencia solar', value: result.pv.toFixed(2) + ' kWp' },
            { label: 'Paneles de ' + result.panelWatts + ' W', value: String(result.panelCount) },
          ] as box}
            <div class="bg-teal-50 border border-teal-100 rounded-2xl p-3 sm:p-4 min-w-0">
              <dt class="text-xs font-semibold text-teal-800">{box.label}</dt>
              <dd class="text-lg sm:text-2xl font-extrabold text-slate-950 mt-2 break-words">{box.value}</dd>
            </div>
          {/each}
        </div>
        <div class="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <strong>Estimación, no instalación aprobada.</strong> Suponemos 80% de profundidad de descarga y 90% de eficiencia de batería,
          75% de rendimiento fotovoltaico y 25% de margen de potencia para el inversor. El cálculo no contempla
          picos de arranque, circuitos críticos distintos, condiciones locales de sol, sombras, protecciones ni normativa.
          Un técnico debe dimensionar y comprobar el sistema antes de comprar.
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          <button type="button" onclick={requestAssessment} class="rounded-xl px-5 py-3 bg-teal-700 text-white font-bold hover:bg-teal-800">Solicitar evaluación técnica</button>
          <button type="button" onclick={copySummary} class="rounded-xl px-5 py-3 border border-teal-200 text-teal-800 font-semibold">{copied ? 'Resumen copiado ✓' : 'Copiar resumen'}</button>
          <button type="button" onclick={reset} class="rounded-xl px-5 py-3 bg-slate-100 text-slate-800 font-semibold">Nuevo cálculo</button>
        </div>
      {/if}
      {#if error}<p role="alert" class="mt-5 border border-red-200 bg-red-50 rounded-xl p-4 text-sm font-medium text-red-800">{error}</p>{/if}
      {#if step < 5}
        <div class="flex justify-between gap-3 border-t border-slate-100 mt-7 pt-6">
          <button type="button" onclick={back} disabled={step === 0} class="rounded-xl border border-slate-300 text-slate-700 font-semibold px-5 py-3 disabled:opacity-40">← Volver</button>
          {#if step < 4}
            <button type="button" onclick={next} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 py-3">Continuar →</button>
          {:else}
            <button type="button" onclick={calculate} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold px-6 py-3">Calcular mi sistema →</button>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .solar-input { display:block; margin-top:.35rem; width:100%; min-width:0; border:1px solid #cbd5e1; border-radius:.8rem; padding:.75rem .85rem; background:#fff; color:#0f172a; }
  .solar-input:focus-visible { outline:2px solid #0f766e; outline-offset:1px; }
  .solar-label { display:block; font-size:.875rem; font-weight:600; color:#334155; }
</style>
