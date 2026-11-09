<script lang="ts">
  type Result = { power: number; battery: number; daily: number; inverter: number; pv: number; panelCount: number; panelWatts: number };
  let phase = $state('monofasica');
  let measurement = $state('real');
  let voltage = $state(220);
  let amps = $state(0);
  let powerFactor = $state(0.85);
  let hoursDaily = $state(6);
  let autonomyHours = $state(5);
  let peakSunHours = $state(4.5);
  let existingEquipment = $state('');
  let result: Result | null = $state(null);
  let error = $state('');

  function calculate(event: SubmitEvent) {
    event.preventDefault(); error = ''; result = null;
    const v = Number(voltage), a = Number(amps), fp = Number(powerFactor);
    const dailyHours = Number(hoursDaily), backup = Number(autonomyHours), sun = Number(peakSunHours);
    if (measurement === 'acometida') {
      error = 'La capacidad del interruptor o acometida no equivale al consumo. Introduce una medición real o una estimación razonada de cargas simultáneas.';
      return;
    }
    if (![v, a, fp, dailyHours, backup, sun].every(Number.isFinite) || v < 50 || v > 600 || a <= 0 || a > 1000 || fp <= 0 || fp > 1 || dailyHours <= 0 || dailyHours > 24 || backup <= 0 || backup > 72 || sun < 1 || sun > 8) {
      error = 'Revisa los valores. Todas las magnitudes deben ser positivas y estar dentro de rangos plausibles.';
      return;
    }
    const multiplier = phase === 'trifasica' ? Math.sqrt(3) : 1;
    const power = v * a * fp * multiplier;
    const daily = (power / 1000) * dailyHours;
    const battery = (power / 1000) * backup / (0.8 * 0.9);
    const pv = daily / (sun * 0.75);
    const inverter = power * 1.25;
    const panelWatts = 450;
    result = { power, daily, battery, pv, inverter, panelWatts, panelCount: Math.ceil(pv * 1000 / panelWatts) };
  }
  function requestAssessment() {
    if (!result) return;
    const query = new URLSearchParams({
      power: result.power.toFixed(0), dailyEnergy: result.daily.toFixed(2),
      batteryCapacity: result.battery.toFixed(2), inverterMin: result.inverter.toFixed(0),
      pvPower: result.pv.toFixed(2), panelCount: String(result.panelCount),
      existingEquipment, phase, measurement,
    });
    window.location.href = `/contacto?${query}`;
  }
</script>

<div class="max-w-4xl mx-auto py-8 px-3">
  <h1 class="text-3xl font-bold mb-3">Asesor solar preliminar</h1>
  <p class="text-gray-600 mb-7">Estimación orientativa de batería, inversor y paneles. Para una oferta real revisaremos los equipos, picos de arranque, sombras y protecciones.</p>
  <form onsubmit={calculate} class="bg-white rounded-xl border p-6 space-y-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label class="block font-medium">Tipo de instalación
        <select bind:value={phase} class="mt-1 w-full border rounded-lg p-3"><option value="monofasica">Monofásica</option><option value="bifasica">Dos líneas / 220 V</option><option value="trifasica">Trifásica (tensión entre líneas)</option></select>
      </label>
      <label class="block font-medium">Origen del dato
        <select bind:value={measurement} class="mt-1 w-full border rounded-lg p-3"><option value="real">Medición real de corriente</option><option value="habitual">Estimación de equipos simultáneos</option><option value="acometida">Solo conozco el interruptor de entrada</option></select>
      </label>
      <label class="block font-medium">Tensión medida (V)
        <input type="number" required min="50" max="600" step="any" bind:value={voltage} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      <label class="block font-medium">Corriente de las cargas (A)
        <input type="number" required min="0.1" max="1000" step="any" bind:value={amps} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      <label class="block font-medium">Factor de potencia estimado
        <input type="number" required min="0.1" max="1" step="0.01" bind:value={powerFactor} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      <label class="block font-medium">Horas diarias de uso de estas cargas
        <input type="number" required min="0.5" max="24" step="any" bind:value={hoursDaily} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      <label class="block font-medium">Horas de respaldo deseadas
        <input type="number" required min="0.5" max="72" step="any" bind:value={autonomyHours} class="mt-1 w-full border rounded-lg p-3" />
      </label>
      <label class="block font-medium">Horas solares pico por día
        <input type="number" required min="1" max="8" step="any" bind:value={peakSunHours} class="mt-1 w-full border rounded-lg p-3" />
      </label>
    </div>
    <label class="block font-medium">Equipos que ya tienes (opcional)
      <input bind:value={existingEquipment} class="mt-1 w-full border rounded-lg p-3" placeholder="Ej.: inversor 3 kW, baterías 48 V…" />
    </label>
    {#if error}<p role="alert" class="text-red-700">{error}</p>{/if}
    <button class="bg-energia-600 text-white py-3 px-6 rounded-lg font-semibold">Calcular estimación</button>
  </form>
  {#if result}
    <section class="mt-7 bg-white border rounded-xl p-6 space-y-5">
      <h2 class="text-2xl font-bold">Resultado orientativo</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Potencia estimada simultánea</p><p class="text-2xl font-bold">{result.power.toFixed(0)} W</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Consumo diario estimado</p><p class="text-2xl font-bold">{result.daily.toFixed(2)} kWh</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Batería nominal aprox.</p><p class="text-2xl font-bold">{result.battery.toFixed(2)} kWh</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Inversor mínimo aproximado</p><p class="text-2xl font-bold">{result.inverter.toFixed(0)} W</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Potencia fotovoltaica estimada</p><p class="text-2xl font-bold">{result.pv.toFixed(2)} kWp</p></div>
        <div class="bg-gray-50 p-4 rounded-lg"><p class="text-xs uppercase text-gray-600">Paneles de {result.panelWatts} W</p><p class="text-2xl font-bold">{result.panelCount} unidades</p></div>
      </div>
      <p class="text-sm text-gray-600">Supuestos: batería con 80% de descarga y 90% de eficiencia; rendimiento fotovoltaico global de 75%; inversor con margen del 25%. Los resultados NO consideran motores, arranque, variación horaria, orientación, sombras ni límites reales de equipos y normativa.</p>
      <button type="button" onclick={requestAssessment} class="bg-energia-600 text-white py-3 px-6 rounded-lg">Solicitar evaluación técnica</button>
    </section>
  {/if}
</div>
