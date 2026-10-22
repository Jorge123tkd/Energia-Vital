/**
 * Prueba de integracion contra el servidor local de la API.
 *
 * Uso:
 *   1) npm run db:seed      (siembra datos de prueba en D1 local)
 *   2) npm run dev          (levanta el worker en http://127.0.0.1:8787)
 *   3) npm test             (en otra terminal)
 *
 * La URL base se puede sobrescribir con la variable BASE_URL.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const LOG_FILE = path.join(__dirname, '..', 'apitest.log');
const out = [];

function log(...a) {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ');
  out.push(s);
}

async function post(body, path = '/api/assistant/message') {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function get(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

(async () => {
  let pass = 0;
  let fail = 0;
  const failures = [];

  function check(name, cond, detail) {
    if (cond) { pass++; log('  OK  ' + name); }
    else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
  }

  // T1: GET /config
  const cfg = await get('/api/assistant/config');
  log('T1 GET /api/assistant/config ->', cfg.status, cfg.body);
  check('T1 status 200', cfg.status === 200, 'status=' + cfg.status);
  check('T1 devuelve objeto config', cfg.body && typeof cfg.body.config === 'object');

  // T2: POST sin mensaje -> 400
  const t2 = await post({});
  log('T2 POST sin message ->', t2.status, t2.body);
  check('T2 status 400', t2.status === 400, 'status=' + t2.status);

  // T3: POST mensaje vacio -> 400
  const t3 = await post({ message: '   ' });
  log('T3 POST message vacio ->', t3.status, t3.body);
  check('T3 status 400', t3.status === 400, 'status=' + t3.status);

  // T4: POST JSON invalido -> 400
  const t4 = await post('{no es json');
  log('T4 POST JSON invalido ->', t4.status, t4.body);
  check('T4 status 400', t4.status === 400, 'status=' + t4.status);

  // T5: POST mensaje valido, nueva sesion (sin session_id)
  const t5 = await post({ message: 'Hola, quiero informacion de paneles solares', channel: 'web' });
  log('T5 POST nueva sesion ->', t5.status, t5.body);
  check('T5 status 200', t5.status === 200, 'status=' + t5.status);
  check('T5 genera session_id', !!(t5.body && t5.body.session_id));
  check('T5 responde con texto', !!(t5.body && typeof t5.body.response === 'string' && t5.body.response.length > 0));
  check('T5 intent solar_advice (no greeting)', t5.body && t5.body.intent === 'solar_advice', 'intent=' + (t5.body && t5.body.intent));
  check('T5 incluye message_id', !!(t5.body && t5.body.message_id));

  // T6: Continuidad de sesion: reutilizar session_id
  const sid = t5.body && t5.body.session_id;
  const t6 = await post({ session_id: sid, message: 'Y los Precios?', channel: 'web' });
  log('T6 POST continuidad sesion ->', t6.status, t6.body);
  check('T6 status 200', t6.status === 200, 'status=' + t6.status);
  check('T6 reutiliza session_id', t6.body && t6.body.session_id === sid, 'sid=' + (t6.body && t6.body.session_id));
  check('T6 intent price_inquiry', t6.body && t6.body.intent === 'price_inquiry', 'intent=' + (t6.body && t6.body.intent));
  check('T6 source determinista', t6.body && ['faq', 'catalog', 'template'].includes(t6.body.source), 'source=' + (t6.body && t6.body.source));

  // T7: Intencion de cita
  const t7 = await post({ message: 'Quiero agendar una cita de instalacion' });
  log('T7 POST cita ->', t7.status, t7.body);
  check('T7 status 200', t7.status === 200, 'status=' + t7.status);
  check('T7 intent appointment', t7.body && t7.body.intent === 'appointment', 'intent=' + (t7.body && t7.body.intent));

  // T8: Pregunta que coincide con la FAQ sembrada
  const t8 = await post({ message: 'Como funciona la garantia de los paneles solares?' });
  log('T8 POST faq ->', t8.status, t8.body);
  check('T8 status 200', t8.status === 200, 'status=' + t8.status);
  check('T8 source faq', t8.body && t8.body.source === 'faq', 'source=' + (t8.body && t8.body.source));

  // T8b: Una FAQ debe responder SOLO a su tema. Una consulta sobre precios no
  // debe devolver la FAQ de mantenimiento aunque ambas mencionen "paneles solares".
  const t8b = await post({ message: 'Cuanto cuestan los paneles solares?' });
  log('T8b POST faq irrelevante ->', t8b.status, t8b.body);
  check('T8b status 200', t8b.status === 200, 'status=' + t8b.status);
  check('T8b no devuelve FAQ de otro tema',
    !(t8b.body && t8b.body.source === 'faq' && /mantenimiento|revision preventiva/i.test(t8b.body.response || '')),
    'source=' + (t8b.body && t8b.body.source) + ' resp=' + String(t8b.body && t8b.body.response).slice(0, 80));

  // T8c: La FAQ si debe responder cuando el usuario menciona su tema concreto
  const t8c = await post({ message: 'Cada cuando debo hacer mantenimiento de los paneles?' });
  log('T8c POST faq por tema ->', t8c.status, t8c.body);
  check('T8c status 200', t8c.status === 200, 'status=' + t8c.status);
  check('T8c source faq', t8c.body && t8c.body.source === 'faq', 'source=' + (t8c.body && t8c.body.source));

  // T9: Historial de la sesion -> debe tener 4 mensajes (2 turnos x 2)
  if (sid) {
    const t9 = await get('/api/assistant/session/' + sid + '/messages');
    log('T9 GET historial ->', t9.status, t9.body);
    check('T9 status 200', t9.status === 200, 'status=' + t9.status);
    const msgs = (t9.body && t9.body.messages) || [];
    check('T9 historial con 4 mensajes', msgs.length === 4, 'total=' + msgs.length);
    check('T9 alterna user/assistant', msgs.length === 4 && msgs[0].role === 'user' && msgs[1].role === 'assistant' && msgs[2].role === 'user' && msgs[3].role === 'assistant',
      'roles=' + msgs.map((m) => m.role).join(','));
    check('T9 message_id de T5 persistido', msgs.some((m) => m.id === t5.body.message_id));
    check('T9 message_id de T6 persistido', msgs.some((m) => m.id === t6.body.message_id));
  }

  // T10: Mensaje demasiado largo -> 413
  const t10 = await post({ message: 'a'.repeat(5000) });
  log('T10 POST demasiado largo ->', t10.status, t10.body);
  check('T10 status 413', t10.status === 413, 'status=' + t10.status);

  // T11: Saludo puro -> intent greeting
  const t11 = await post({ message: 'Hola' });
  log('T11 POST saludo puro ->', t11.status, t11.body);
  check('T11 intent greeting', t11.body && t11.body.intent === 'greeting', 'intent=' + (t11.body && t11.body.intent));

  // T12: Mismo session_id enviado dos veces en paralelo (idempotencia del UPSERT)
  const parSid = 'test-parallel-' + Date.now();
  const [pa, pb] = await Promise.all([
    post({ session_id: parSid, message: 'hola' }),
    post({ session_id: parSid, message: 'precios' }),
  ]);
  log('T12 POST paralelo ->', pa.status, pb.status);
  check('T12 ambos 200 sin UNIQUE violation', pa.status === 200 && pb.status === 200, 'status=' + pa.status + '/' + pb.status);

  log('');
  log('RESUMEN: pass=' + pass + ' fail=' + fail);
  if (failures.length) {
    log('FALLOS:');
    for (const f of failures) log(' - ' + f);
  }

  fs.writeFileSync(LOG_FILE, out.join('\n'), 'utf8');
  console.log('DONE pass=' + pass + ' fail=' + fail);
  console.log('Log: ' + LOG_FILE);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
