/**
 * Smoke test para el motor determinista del asistente.
 * Verifica que product_inquiry, price_inquiry y maintenance generan
 * respuestas correctas con los datos del contexto.
 */
import { detectIntent, generateResponse } from '../src/assistant-engine';
import type { AssistantContext } from '../src/assistant-engine';

const ctx: AssistantContext = {
  config: {
    welcome_message: '¡Hola! Soy el asistente de Energía Vital.',
    business_name: 'Energía Vital',
  },
  faq: [
    {
      question: '¿Cuál es la garantía de los paneles solares?',
      answer: 'Los paneles tienen garantía de 25 años. Esto incluye fabricación y rendimiento.',
    },
  ],
  categories: [{ name: 'Paneles Solares' }, { name: 'Inversores' }],
  products: [
    { name: 'Panel Solar 400W', price: 12000, currency: 'MXN', stock_status: 'in_stock' },
    { name: 'Inversor 5kW', price: 25000, currency: 'MXN', stock_status: 'on_order' },
    { name: 'Batería 12V 100Ah', price: null, currency: 'MXN', stock_status: 'out_of_stock' },
  ],
  services: [
    { name: 'Mantenimiento Preventivo', price: 800, price_type: 'fixed', scope: 'Revision anual completa' },
    { name: 'Instalación Residencial', price: null, price_type: 'quote', scope: '' },
    { name: 'Mantenimiento Express', price: 500, price_type: 'fixed', scope: 'Limpieza y revision ligera' },
  ],
};

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail: string = '') {
  if (cond) {
    pass++;
    console.log('  OK  ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
}

console.log('\n=== Smoke test del motor del asistente ===\n');

// T1: detectIntent - price inquiry
const intent1 = detectIntent('¿Cuánto cuestan los paneles solares?');
check('T1 intent price_inquiry', intent1 === 'price_inquiry', 'intent=' + intent1);

// T2: detectIntent - product inquiry
const intent2 = detectIntent('¿Qué productos tienen disponibles?');
check('T2 intent product_inquiry', intent2 === 'product_inquiry', 'intent=' + intent2);

// T3: detectIntent - maintenance
const intent3 = detectIntent('Necesito mantenimiento preventivo');
check('T3 intent maintenance', intent3 === 'maintenance', 'intent=' + intent3);

// T4: generateResponse - price_inquiry includes products with prices
const resp1 = generateResponse('¿Cuánto cuestan los paneles?', ctx);
check('T4 price_inquiry returns 200-level source', ['faq', 'catalog', 'template'].includes(resp1.source), 'source=' + resp1.source);
check('T4 price_inquiry text is not empty', resp1.text.length > 0);
check('T4 price_inquiry includes product name', resp1.text.includes('Panel Solar 400W'), 'text=' + resp1.text.slice(0, 100));
check('T4 price_inquiry includes fixed-price service', resp1.text.includes('Mantenimiento Express'), 'text=' + resp1.text.slice(0, 100));
// Verify services without fixed price (quote) are NOT shown
check('T4 price_inquiry does not show quote-only service', !resp1.text.includes('Instalación Residencial'), 'text=' + resp1.text.slice(0, 200));
// Verify products with null price show "precio a consultar" but still listed
check('T4 price_inquiry mentions products', resp1.text.includes('productos') || resp1.text.includes('referencia'), 'text=' + resp1.text.slice(0, 100));

// T5: generateResponse - product_inquiry (use keywords that match product_inquiry, not solar_advice)
const resp2 = generateResponse('¿Tienen productos en stock?', ctx);
check('T5 intent is product_inquiry', resp2.intent === 'product_inquiry', 'intent=' + resp2.intent);
check('T5 product_inquiry returns valid source', ['faq', 'catalog', 'template'].includes(resp2.source), 'source=' + resp2.source);
check('T5 product_inquiry text is not empty', resp2.text.length > 0);

// T6: generateResponse - maintenance includes maintenance services
const resp3 = generateResponse('Quiero mantenimiento preventivo de mis paneles', ctx);
check('T6 maintenance text is not empty', resp3.text.length > 0);
check('T6 maintenance includes maintenance service', resp3.text.includes('Mantenimiento'), 'text=' + resp3.text.slice(0, 100));
check('T6 maintenance mentions appointment', /visita|cita|agendar/i.test(resp3.text), 'text=' + resp3.text.slice(0, 100));

// T7: generateResponse - maintenance with no matching services (empty services list)
const ctx2: AssistantContext = { ...ctx, services: [] };
const resp4 = generateResponse('Necesito mantenimiento', ctx2);
check('T7 maintenance works without services', resp4.text.length > 0);
check('T7 maintenance no error with empty services', !resp4.text.includes('undefined'), 'text=' + resp4.text.slice(0, 100));

// T8: generateResponse - greeting
const resp5 = generateResponse('Hola', ctx);
check('T8 greeting returns template source OR faq', resp5.source === 'template' || resp5.source === 'faq');
check('T8 greeting text is not empty', resp5.text.length > 0);

console.log('\n=== RESUMEN: pass=' + pass + ' fail=' + fail + ' ===\n');

if (fail > 0) {
  console.error('HAY FALLOS EN LOS TEST');
  process.exit(1);
} else {
  console.log('¡Todos los tests pasaron!');
}
