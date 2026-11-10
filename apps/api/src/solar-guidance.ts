/** Conversación solar guiada y determinista, ligada a la sesión privada del cliente. */
export type SolarStage = 'phase' | 'origin' | 'power' | 'measurement' | 'hours' | 'backup' | 'sun';
export type SolarState = {
  stage: SolarStage;
  phase?: 'monofasica' | 'bifasica' | 'trifasica';
  origin?: 'equipos' | 'medicion';
  watts?: number;
  hours?: number;
  backup?: number;
};
type StepResult = { handled: boolean; state: SolarState | null; reply: string };
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
const valid = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
const phaseQuestion = 'Empecemos el asesoramiento solar de Bonaire, una pregunta a la vez.\n\n1. Monofásica\n2. Dos líneas / 220 V\n3. Trifásica\n\n¿Qué tipo de instalación tienes? Responde 1, 2 o 3.';
const originQuestion = '¿De dónde vienen tus datos de consumo?\n\n1. Lista de electrodomésticos: ya sumé aproximadamente sus potencias en W.\n2. Medí voltios y amperios de las cargas encendidas.\n\nSi solo conoces el amperaje del interruptor general, eso NO es consumo; elige 1 para empezar con tus equipos.';
const flowStart = /asesoramiento solar|asesoria solar|asesor solar|dimensionar (?:mi|un|el) sistema|calcular (?:mi|un|el) sistema solar|empezar (?:el|un) calculo solar|estudio solar paso a paso/;
export function advanceSolarGuidance(input: string, previous?: SolarState | null): StepResult {
  const message = normalize(input);
  const reset = /^(reiniciar|empezar de nuevo|nuevo calculo)$/.test(message);
  const cancel = /^(cancelar|salir de asesoria|terminar asesoria|detener calculo)$/.test(message);
  if (cancel && previous) return { handled: true, state: null, reply: 'Asesoramiento cancelado. Puedes hacer otra pregunta o decir «asesoramiento solar» para comenzar de nuevo.' };
  if (reset && previous || flowStart.test(message)) {
    return { handled: true, state: { stage: 'phase' }, reply: phaseQuestion };
  }
  if (!previous) return { handled: false, state: null, reply: '' };
  const invalid = (help: string): StepResult => ({
    handled: true, state: previous, reply: help + '\n\nPuedes escribir «cancelar» o «reiniciar» en cualquier momento.'
  });
  switch (previous.stage) {
    case 'phase': {
      const phase = message === '1' || message.includes('monofas') ? 'monofasica'
        : message === '2' || message.includes('bifas') || message.includes('dos linea') ? 'bifasica'
        : message === '3' || message.includes('trifas') ? 'trifasica' : null;
      if (!phase) return invalid(phaseQuestion);
      return { handled: true, state: { ...previous, phase, stage: 'origin' }, reply: originQuestion };
    }
    case 'origin': {
      const origin = message === '1' || message.includes('equipo') || message.includes('electrodomest') ? 'equipos'
        : message === '2' || message.includes('medic') || message.includes('amper') ? 'medicion' : null;
      if (!origin) return invalid(originQuestion);
      return origin === 'equipos'
        ? { handled: true, state: { ...previous, origin, stage: 'power' },
          reply: '¿Cuántos vatios (W) consumirán aproximadamente TODOS los equipos encendidos a la vez? Suma sus potencias nominales y responde solo el total. Ejemplo: «850 W». No uses el amperaje de la acometida.' }
        : { handled: true, state: { ...previous, origin, stage: 'measurement' },
          reply: 'Indica los valores medidos bajo carga en este orden: voltaje (V), corriente (A) y factor de potencia (FP). Ejemplo: «220 V, 8 A, 0.85». Para trifásica utiliza el voltaje entre líneas. Si no conoces el FP, responde solo V y A; usaremos 0.85 como supuesto.' };
    }
    case 'power': {
      const values = numbers(message);
      if (values.length !== 1 || !valid(values[0], 1, 250000))
        return invalid('Necesito un único total de potencia de los equipos en vatios, por ejemplo: «850 W».');
      return { handled: true, state: { ...previous, watts: values[0], stage: 'hours' },
        reply: '¿Cuántas horas al día funcionan aproximadamente esas cargas? Por ejemplo: «6 horas». Es una simplificación: para un cálculo más preciso por electrodoméstico puedes utilizar la página «Asesor solar».' };
    }
    case 'measurement': {
      const values = numbers(message);
      if ((values.length !== 2 && values.length !== 3) ||
        !valid(values[0], 50, 600) || !valid(values[1], 0.1, 1000) ||
        (values.length === 3 && !valid(values[2], 0.1, 1)))
        return invalid('Indica voltios, amperios realmente medidos bajo carga y factor de potencia opcional. Ejemplo: «220, 8, 0.85».');
      const [v, a, fp = 0.85] = values;
      const watts = v * a * fp * (previous.phase === 'trifasica' ? Math.sqrt(3) : 1);
      if (!valid(watts, 1, 250000)) return invalid('La potencia calculada es demasiado alta; verifica las medidas.');
      return { handled: true, state: { ...previous, watts, stage: 'hours' },
        reply: `Potencia estimada: ${watts.toFixed(0)} W${values.length === 2 ? ' (supuse FP = 0.85)' : ''}.\n\n¿Cuántas horas diarias funcionan esas cargas? Ejemplo: «6».` };
    }
    case 'hours': {
      const vals = numbers(message);
      if (vals.length !== 1 || !valid(vals[0], 0.1, 24)) return invalid('Responde horas de uso diario entre 0,1 y 24. Ejemplo: «6».');
      return { handled: true, state: { ...previous, hours: vals[0], stage: 'backup' },
        reply: '¿Cuántas horas de autonomía necesitas durante un apagón, con esas cargas encendidas? Ejemplo: «5 horas».' };
    }
    case 'backup': {
      const vals = numbers(message);
      if (vals.length !== 1 || !valid(vals[0], 0.5, 72)) return invalid('Indica entre 0,5 y 72 horas de respaldo. Ejemplo: «5».');
      return { handled: true, state: { ...previous, backup: vals[0], stage: 'sun' },
        reply: 'Última pregunta: ¿cuántas horas solares pico por día podemos considerar? Si no sabes, responde «4,5» como supuesto inicial para revisar después según ubicación, estación y sombras.' };
    }
    case 'sun': {
      const vals = numbers(message);
      if (vals.length !== 1 || !valid(vals[0], 1, 8))
        return invalid('Indica horas solares pico entre 1 y 8. Como supuesto inicial puedes usar «4,5».');
      const watts = previous.watts || 0, hours = previous.hours || 0, backup = previous.backup || 0;
      if (!valid(watts, 1, 250000) || !valid(hours, 0.1, 24) || !valid(backup, 0.5, 72))
        return { handled: true, state: { stage: 'phase' }, reply: 'Faltan datos en este cálculo. ' + phaseQuestion };
      const daily = watts * hours / 1000;
      const battery = watts * backup / 1000 / (0.8 * 0.9);
      const pv = daily / (vals[0] * 0.75);
      const inverter = watts * 1.25;
      const panels = Math.ceil(pv * 1000 / 450);
      const reply = `Esta es tu estimación solar inicial de Bonaire:\n\n• Potencia simultánea: ${watts.toFixed(0)} W\n• Consumo diario: ${daily.toFixed(2)} kWh\n• Batería nominal aproximada: ${battery.toFixed(2)} kWh\n• Inversor orientativo: ${inverter.toFixed(0)} W\n• Potencia de paneles: ${pv.toFixed(2)} kWp (aprox. ${panels} paneles de 450 W)\n\nSupuestos: 80% de descarga y 90% de eficiencia de batería; rendimiento solar 75%; margen del inversor 25%. Esta estimación NO incluye picos de arranque, sombras, protecciones o diseño eléctrico. Solicita una evaluación técnica antes de comprar. Para detallar cada electrodoméstico usa «Asesor solar». ¿Quieres información sobre nuestros servicios o iniciar otro cálculo?`;
      return { handled: true, state: null, reply };
    }
  }
}
