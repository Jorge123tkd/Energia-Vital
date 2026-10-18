<script lang="ts">
  let step = 1;
  const totalSteps = 4;

  let amps = '';
  let voltage = '';
  let phases = '';
  let measurementType = '';
  let powerWatts = '';
  let autonomyHours = '';
  let systemType = '';
  let coverage = '';
  let sunHours = '';
  let existingEquipment = '';

  let results: any = null;
  let calculating = false;

  function nextStep() {
    if (step < totalSteps) step++;
  }

  function prevStep() {
    if (step > 1) step--;
  }
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Asesor Solar</h1>
    <p class="text-gray-600">Calcula el sistema solar que necesitas para tu vivienda.</p>

    {#if step === 1}
      <div class="space-y-6">
        <h2 class="text-xl font-bold text-gray-900">Información de consumo</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Amperios de consumo</label>
            <input type="number" bind:value={amps} placeholder="Ej: 10" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Voltaje (V)</label>
            <input type="number" bind:value={voltage} placeholder="Ej: 220" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de instalación</label>
          <select bind:value={phases} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none">
            <option value="monofasica">Monofásica (120V o 220V)</option>
            <option value="bifasica">Bifásica (dos líneas de 120V)</option>
            <option value="trifasica">Trifásica</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de medición</label>
          <select bind:value={measurementType} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none">
            <option value="real">Medición real (amperímetro)</option>
            <option value="habitual">Consumo habitual estimado</option>
            <option value="acometida">Capacidad de la acometida</option>
          </select>
        </div>
      </div>
    {:else if step === 2}
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 md:p-8 shadow-sm">
      <div class="space-y-6">
        <h2 class="text-xl font-bold text-gray-900">Potencia y autonomía</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Potencia estimada (W)</label>
            <input type="number" bind:value={powerWatts} placeholder="Ej: 2200" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Horas de autonomía</label>
            <input type="number" bind:value={autonomyHours} placeholder="Ej: 8" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de sistema</label>
          <select bind:value={systemType} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none">
            <option value="baterias">Solo baterías (respaldo)</option>
            <option value="solar">Sistema con paneles solares</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Cobertura</label>
          <select bind:value={coverage} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none">
            <option value="esenciales">Solo cargas esenciales</option>
            <option value="toda">Toda la vivienda</option>
          </select>
        </div>
      </div>
    {:else if step === 3}
      <div class="space-y-6">
        <h2 class="text-xl font-bold text-gray-900">Condiciones solares</h2>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Horas de sol pico (estimado)</label>
          <input type="number" bind:value={sunHours} placeholder="Ej: 4.5" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
          <p class="text-xs text-gray-500 mt-1">Según tu ubicación y condiciones de instalación.</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Equipo existente</label>
          <input type="text" bind:value={existingEquipment} placeholder="Ej: Inversor de 3000W (opcional)" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-energia-500 outline-none" />
        </div>
      </div>
    {:else if step === 4}
      {#if results}
        <div class="space-y-6">
          <h2 class="text-xl font-bold text-gray-900">Resultado preliminar</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Potencia estimada</p>
              <p class="text-2xl font-bold text-gray-900">{results.power.toFixed(0)} W</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Energía por autonomía</p>
              <p class="text-2xl font-bold text-gray-900">{results.dailyEnergy.toFixed(1)} kWh</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Capacidad batería (nominal)</p>
              <p class="text-2xl font-bold text-gray-900">{results.batteryCapacity.toFixed(1)} kWh</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Inversor mínimo recomendado</p>
              <p class="text-2xl font-bold text-gray-900">{results.inverterMin.toFixed(0)} W</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Potencia fotovoltaica</p>
              <p class="text-2xl font-bold text-gray-900">{results.pvPower.toFixed(1)} kWp</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-500 uppercase">Cantidad de paneles ({results.panelWatts} W c/u)</p>
              <p class="text-2xl font-bold text-gray-900">{results.panelCount} paneles</p>
            </div>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p class="text-sm text-amber-800">
              <strong>Nota importante:</strong> Esta es una estimación preliminar basada en los datos proporcionados. La configuración definitiva debe verificarse mediante una evaluación técnica de la instalación, las cargas, las condiciones solares, el cableado y la compatibilidad de los equipos.
            </p>
          </div>
          <button class="w-full bg-energia-600 text-white py-3 rounded-lg font-medium hover:bg-energia-700 transition-colors">
            Solicitar evaluación técnica
          </button>
        </div>
      {:else}
        <div class="text-center py-10 text-gray-500">Calcula tus resultados en el paso anterior.</div>
      {/if}
    {/if}

    <div class="flex justify-between mt-8 pt-6 border-t border-gray-200">
      {#if step > 1}
        <button class="text-gray-600 hover:text-energia-600 font-medium" onclick={prevStep}>Anterior</button>
      {/if}
      {#if step < totalSteps}
        <button class="bg-energia-600 text-white px-6 py-2 rounded-md font-medium hover:bg-energia-700 transition-colors" onclick={nextStep}>Siguiente</button>
      {:else if results}
        <button class="bg-energia-600 text-white px-6 py-2 rounded-md font-medium hover:bg-energia-700 transition-colors" onclick={calculate}>Calcular</button>
      {/if}
    </div>
  </div>
</div>

<script>
  async function calculate() {
    calculating = true;
    const v = parseFloat(voltage) || 220;
    const i = parseFloat(amps) || 0;
    const fp = 0.85;
    const power = v * i * fp;
    const energyPerHour = power / 1000;
    const autonomy = parseFloat(autonomyHours) || 5;
    const dailyEnergy = energyPerHour * autonomy;
    const dod = 0.8;
    const efficiency = 0.9;
    const batteryCapacity = dailyEnergy / (dod * efficiency);
    const inverterMin = power * 1.25;
    const peakSunHours = parseFloat(sunHours) || 4;
    const pvPower = dailyEnergy / (peakSunHours * 0.75);
    const panelWatts = 450;
    const panelCount = Math.ceil((pvPower * 1000) / panelWatts);

    results = {
      power: power,
      energyPerHour: energyPerHour,
      dailyEnergy: dailyEnergy,
      batteryCapacity: batteryCapacity,
      inverterMin: inverterMin,
      pvPower: pvPower,
      panelCount: panelCount,
      panelWatts: panelWatts,
    };
    calculating = false;
  }
</script>
    <div class="flex justify-between items-center mb-6">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paso {step} de {totalSteps}</span>
      <div class="flex gap-1">
        {#each Array(totalSteps) as _, i}
          <div class="w-2 h-2 rounded-full" class:bg-energia-600={i < step} class:bg-gray-300={i >= step}></div>
        {/each}
      </div>
    </div>