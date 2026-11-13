import { Env } from './types';

/**
 * Motor determinista del asistente (Nivel 1).
 * Las respuestas se construyen con datos reales de D1 (catálogo, categorías y FAQ),
 * y con la configuración editable desde el panel de administración.
 */

export interface AssistantContext {
  config: Record<string, string>;
  faq: { question: string; answer: string }[];
  categories: { name: string }[];
  products: { name: string; price: number | null; currency: string; stock_status: string }[];
  services: { name: string; price: number | null; price_type: string; scope: string }[];
}

export type AssistantIntent =
  | 'greeting'
  | 'solar_advice'
  | 'price_inquiry'
  | 'currency_exchange'
  | 'appointment'
  | 'repair'
  | 'maintenance'
  | 'product_inquiry'
  | 'complaint'
  | 'telegram'
  | 'business_proposal'
  | 'service_request'
  | 'general';

const DEFAULT_WELCOME =
  '¡Hola! Soy el asistente de Bonaire. ¿En qué puedo ayudarte hoy?';

/** Un mensaje fuera del ámbito comercial debe recibir una redirección breve, no una explicación inventada. */
export const OUT_OF_SCOPE_REPLY =
  'Sobre ese tema no tengo información para ofrecerte. Soy el asistente de Bonaire y puedo asesorarte sobre paneles solares, inversores, baterías, autonomía eléctrica, productos, servicios y propuestas comerciales de suministro, promoción, distribución o asociación con Bonaire. ¿En qué puedo ayudarte?';

/** Preguntas ajenas a Bonaire: interceptarlas incluso cuando el modelo de IA esté activado. */
export function isOutOfScopeMessage(message:string): boolean {
  const m = normalize(message);
  const external = /\b(?:crisis mundial|crisis global|economia mundial|inflacion|guerras?|conflictos? internacionales|politica|politicos?|elecciones?|presidentes?|futbol|deportes?|mundial de futbol|peliculas?|musica|cantantes?|horoscopos?|historia universal|noticias mundiales|noticias internacionales)\b/.test(m);
  // Permitir cuestiones sobre crisis del suministro o coste energético vinculadas a Bonaire.
  const business = /\b(?:bonaire|panel(?:es)?|solar(?:es)?|inversor(?:es)?|baterias?|electricidad|apagones?|corriente|energia|fotovoltaic[oa]s?|reparacion(?:es)?|mantenimiento|servicio(?:s)?|instalacion(?:es)?|catalogo)\b/.test(m);
  return external && !business;
}

/** Propuestas dirigidas a Bonaire; mencionar una empresa no basta para iniciar este flujo. */
export function isBusinessProposal(message: string): boolean {
  const m = normalize(message);
  if (/\b(?:no quiero|no queremos|no deseo|no buscamos)\b.{0,35}\b(?:asociar|colaborar|distribu|proveedor|negocio|promocion)/.test(m)) return false;
  return /\b(?:ser|seremos|somos|como) (?:su |vuestro |un |el |sus |uno de sus )?(?:proveedor(?:es)?|distribuidor(?:es)?)\b/.test(m)
    || /\b(?:queremos|quiero|buscamos|nos interesa|me interesa|interesad[oa]s? en)\b.{0,90}\b(?:asociarnos|asociarme|colaborar|alianza|asociacion|distribu(?:yan|ir|idor(?:es)?)|promocion(?:en|ar)?|represent(?:en|arnos|acion)|negocios? con (?:ustedes|bonaire))\b/.test(m)
    || /\b(?:propuesta|alianza|asociacion|colaboracion|representacion) comercial\b/.test(m)
    || /\b(?:ofrecemos|ofrezco|suministramos|fabricamos)\b.{0,100}\b(?:a bonaire|a ustedes|para ustedes|distribuidores|distribuyan)\b/.test(m)
    || /\b(?:que|para que) (?:ustedes |bonaire )?(?:nos |los |las )?(?:promocionen|distribuyan|representen)\b/.test(m);
}

/** Respuesta comercial determinista: no crea solicitudes ni promete acuerdos. */
export function businessProposalReply(message: string, history: {role:string;content:string}[] = []): string | null {
  const previous = [...history].reverse().find(h => h.role === 'assistant');
  const pending = previous?.content.startsWith('Propuesta comercial · Bonaire');
  const m = normalize(message);
  const explicit = isBusinessProposal(message);
  if (!explicit && !pending) return null;
  if (pending && /^(?:cancelar|cancela|olvidalo|otra cosa|no gracias)[.! ]*$/.test(m))
    return 'De acuerdo, dejamos la propuesta comercial aquí. ¿En qué más puedo ayudarte?';
  // Una pregunta nueva de asesoramiento/servicio no debe convertirse en datos de la empresa.
  if (!explicit && (/\?|\b(?:asesoramiento|asesorame|como|que es|cuanto|necesito|solicitar|contratar|agendar)\b/.test(m) || isOutOfScopeMessage(message))) return null;
  if (pending) {
    const start = history.length - 1 - [...history].reverse().findIndex(h => h.role === 'assistant' && h.content.startsWith('Propuesta comercial · Bonaire'));
    const initial = [...history.slice(0,start)].reverse().find(h => h.role === 'user');
    return 'Gracias. Este es el resumen de tu propuesta para revisar antes de compartirla con el equipo de Bonaire:\n\n'
      + [initial?.content, message].filter(Boolean).join('\n\n')
      + '\n\nPuedes corregir o completar estos datos al contactar al equipo: empresa y país, persona de contacto, productos o marca, y qué colaboración buscas (suministro, promoción, distribución en Cuba o asociación). No necesitas enviar documentos fiscales en este primer contacto.'
      + '\n\nContacta con el equipo comercial por los canales publicados aquí: https://energia-vital-web.pages.dev/contacto#contacto-comercial'
      + '\n\nLa propuesta permanece en esta conversación; no se ha enviado como solicitud ni aceptado ningún acuerdo. El equipo evaluará condiciones, disponibilidad y alcance contigo.';
  }
  return 'Propuesta comercial · Bonaire\n\nPodemos orientarte para presentar una propuesta como proveedor, promocionar tu marca, proponer que Bonaire distribuya tus productos en Cuba o explorar una asociación comercial. No tiene que tratarse de energía solar.'
    + '\n\nCuéntame brevemente qué empresa representas, de qué país es y qué colaboración propones. Añade solo los datos que todavía no hayas mencionado; si actúas por cuenta propia, puedes indicarlo.'
    + '\n\nEsto prepara la conversación con nuestro equipo; no confirma un acuerdo ni crea una solicitud de servicio. Si prefieres hablar directamente con una persona: https://energia-vital-web.pages.dev/contacto#contacto-comercial';
}

export function detectIntent(message: string): AssistantIntent {
  const m = normalizeWithTypos(message);

  if (isBusinessProposal(message)) return 'business_proposal';

  // El precio del dólar no pertenece al catálogo de productos.
  if (isCurrencyQuestion(m)) return 'currency_exchange';

  // Un saludo solo se detecta si el mensaje es esencialmente un saludo.
  if (isPureGreeting(m)) {
    return 'greeting';
  }
  if (hasAny(m, ['repar', 'averia', 'falla', 'no enciende', 'error', 'quemo', 'quemado', 'arreglar'])) {
    return 'repair';
  }
  if (hasAny(m, ['mantenimiento', 'preventivo', 'revision', 'limpieza', 'limpiar'])) {
    return 'maintenance';
  }
  if (hasAny(m, ['cita', 'agendar', 'agenda', 'reservar', 'visita', 'calendario', 'horario'])) {
    return 'appointment';
  }
  if (hasAny(m, ['disponibilidad', 'existencia', 'venden', 'comprar', 'compraria', 'tienen en venta', 'en stock', 'hay disponible'])) {
    return 'product_inquiry';
  }
  if (hasAny(m, ['servicios', 'solicitar servicio', 'servicio tecnico', 'instalacion a domicilio', 'hacen instalaciones', 'servicio de instalacion'])) {
    return 'service_request';
  }
  if (hasAny(m, ['precio', 'cuanto', 'cotizar', 'cotizacion', 'valor', 'costo', 'presupuesto', 'cuesta'])) {
    return 'price_inquiry';
  }
  if (hasAny(m, ['solar', 'panel', 'inversor', 'bateria', 'instalacion', 'autonomia', 'paneles', 'baterias', 'inversores'])) {
    return 'solar_advice';
  }
  if (hasAny(m, ['producto', 'catalogo', 'equipo', 'venta', 'disponible', 'stock'])) {
    return 'product_inquiry';
  }
  if (hasAny(m, ['queja', 'sugerencia', 'reclamo', 'falla de atencion', 'feedback'])) {
    return 'complaint';
  }
  if (hasAny(m, ['telegram', 'whatsapp'])) {
    return 'telegram';
  }
  return 'general';
}

/**
 * Normaliza texto: corrige errores ortográficos comunes, minúsculas y sin acentos.
 */
function normalizeWithTypos(text: string): string {
  let normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Aplicar correcciones de errores ortográficos comunes
  const typoCorrections: [string, string][] = [
    ['slAR', 'solar'], ['slAr', 'solar'], ['mantemiento', 'mantenimiento'],
    ['mantenimeinto', 'mantenimiento'], ['instalcion', 'instalacion'],
    ['paneles', 'panel'], ['baterias', 'bateria'], ['inversores', 'inversor'],
    ['prespuesto', 'presupuesto'], ['cuesta', 'cuanto'], ['cuestan', 'cuanto'],
    ['arreglar', 'repar'], ['averiado', 'averia'], ['quemado', 'quemo'],
    ['limpieza', 'mantenimiento'], ['limpiar', 'mantenimiento'],
    ['cotice', 'cotizar'], ['agende', 'agendar'],
  ];
  for (const [typo, correct] of typoCorrections) {
    normalized = normalized.replace(new RegExp(typo, 'g'), correct);
  }
  return normalized;
}

/**
 * Verdadeero si el mensaje es solo un saludo (con palabras de cortesía),
 * sin ningún tema o consulta adicional.
 */
function isPureGreeting(m: string): boolean {
  const GREETINGS = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'saludos', 'que tal', 'hi', 'hello', 'inicio', 'start'];
  const FILLERS = ['gracias', 'por favor', 'amigo', 'estimado', 'que', 'tal', 'como', 'andas'];

  if (/^(buenos dias|buenas tardes|buenas noches|que tal|hola|buenas|saludos|hey|hello|hi)([!?. ]*)$/.test(m.trim())) return true;
  const words = m.split(/[^a-z0-9]+/).filter((w) => w.length > 0);

  // Sin palabras -> no es saludo.
  if (words.length === 0) return false;

  const hasGreeting = words.some((w) => GREETINGS.includes(w));
  if (!hasGreeting) return false;

  // Si hay palabras que no son saludo ni relleno, hay un tema -> no es saludo puro.
  return words.every((w) => GREETINGS.includes(w) || FILLERS.includes(w));
}

/** Normaliza texto: minúsculas y sin acentos, para comparar palabras clave. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isCurrencyQuestion(text: string): boolean {
  const m = normalize(text);
  const named = /\b(?:dolar(?:es)?|euros?|usd|eur|mlc|divisas?|moneda nacional|peso cubano|cup)\b/.test(m);
  const exchange = /\b(?:cambio|cambiar|tasa|tipo de cambio|cotizacion|equivale|equivalencia|cuanto|precio|valor|vale)\b/.test(m);
  const goods = /\b(?:panel(?:es)?|baterias?|inversor(?:es)?|servicios?|equipos?|productos?)\b/.test(m);
  const pair = /\b(?:dolar(?:es)?|euros?|usd|eur)\s+(?:a|al|en|por)\s+(?:dolar(?:es)?|euros?|usd|eur|cup|pesos?|moneda nacional)\b/.test(m);
  // Aceptar signos de apertura españoles en continuaciones como «¿y el euro?».
  const followup = /^(?:y\s+)?(?:el|los)\s+(?:dolar(?:es)?|euros?)$/.test(
    m.replace(/^[¿?¡!\s]+|[¿?¡!\s]+$/g, '').trim());
  return named && (exchange || pair || followup || /^(?:dolar(?:es)?|euros?|usd|eur|mlc)$/.test(m)) &&
    !(goods && !/\b(?:tasa|cambio|cotizacion)\b/.test(m));
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/** Calcula distancia de Levenshtein simplificada para matching difuso. */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/** Verifica si una palabra está cerca de una palabra clave (distancia <= 30% del largo). */
function fuzzyMatch(word: string, keyword: string): boolean {
  if (word.length < 3 || keyword.length < 3) return word === keyword;
  const maxDist = Math.ceil(Math.max(word.length, keyword.length) * 0.3);
  return levenshtein(word, keyword) <= maxDist;
}

/** Verifica si alguna palabra del texto está cerca de alguna aguja (fuzzy). */
function fuzzyHasAny(text: string, needles: string[]): boolean {
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  return needles.some((n) => words.some((w) => fuzzyMatch(w, n)));
}

/** Tokens relevantes de la consulta (sin palabras vacías, mínimo 4 letras). */
function tokenize(text: string): string[] {
  const stop = new Set([
    // Palabras de cortesía y relleno
    'hola', 'gracias', 'amigo', 'favor', 'buenos', 'buenas',
    // Verbos y auxiliares sin valor temático
    'quiero', 'necesito', 'tengo', 'tiene', 'tienen', 'puede',
    'pueden', 'podemos', 'quieren', 'hace', 'hacen', 'hacer', 'debe',
    'deben', 'debo', 'dar', 'dan', 'saber', 'decir', 'dime', 'digame',
    'estoy', 'esta', 'este', 'esto', 'esos', 'esas', 'seria', 'ser',
    // Interrogativos y conectores: no identifican el tema de la consulta
    'cuanto', 'cuantos', 'cuanta', 'cuantas', 'cuesta', 'cuestan',
    'coste', 'valor', 'valores', 'precio', 'precios',
    'cual', 'cuales', 'donde', 'cuando', 'como', 'porque', 'para', 'pero',
    'sobre', 'todo', 'toda', 'todos', 'todas', 'mismo', 'misma', 'tengo',
    'quisiera', 'queria', 'gustaria', 'necesitaria', 'informacion',
    'consulta', 'consultar', 'preguntar', 'pregunta',
  ]);
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
}

/** Puntúa la coincidencia entre la pregunta del usuario y una FAQ. */
function faqScore(question: string, tokens: string[]): number {
  const q = normalize(question);
  let score = 0;
  for (const t of tokens) {
    if (q.includes(t)) score += t.length > 5 ? 2 : 1;
  }
  return score;
}

/**
 * Palabras genéricas del dominio solar. No identifican por sí solas una FAQ
 * concreta: "paneles solares" aparece en casi todas las preguntas, así que
 *|matchar| solo con ellas produce respuestas irrelevantes (por ejemplo, una
 * pregunta sobre precios que terminaba respondiendo la FAQ de mantenimiento).
 */
const GENERIC_DOMAIN_WORDS = new Set([
  'panel', 'paneles', 'solar', 'solares', 'fotovoltaico', 'fotovoltaicos',
  'inversor', 'inversores', 'bateria', 'baterias', 'energia',
  'sistema', 'sistemas', 'servicio', 'servicios', 'equipo', 'equipos',
  'empresa', 'vivienda', 'casa', 'precio', 'precios', 'costo', 'costos',
  'trabajo', 'trabajos', 'proyecto', 'proyectos', 'cliente', 'clientes',
]);

/**
 * Palabras que identifican el tema concreto de una FAQ (las que no son
 * genéricas del dominio). Si el usuario no menciona ninguna de ellas, esa FAQ
 * no es una respuesta válida para su consulta.
 */
function topicWords(question: string): string[] {
  return tokenize(question).filter((t) => !GENERIC_DOMAIN_WORDS.has(t));
}

/** Carga el contexto del asistente desde D1 (config, FAQ, catálogo, servicios). */
export async function loadAssistantContext(db: D1Database): Promise<AssistantContext> {
  const [configRows, faqRows, catRows, prodRows, svcRows] = await Promise.all([
    db.prepare('SELECT key, value FROM assistant_config').all<{ key: string; value: string }>(),
    db
      .prepare(
        'SELECT question, answer FROM frequently_asked_questions WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 50'
      )
      .all<{ question: string; answer: string }>(),
    db.prepare('SELECT name FROM categories WHERE is_active = 1 ORDER BY sort_order ASC').all<{ name: string }>(),
    db
      .prepare(
        'SELECT name, price, currency, stock_status FROM products WHERE is_active = 1 ORDER BY is_featured DESC, sort_order ASC LIMIT 12'
      )
      .all<{ name: string; price: number | null; currency: string; stock_status: string }>(),
    db
      .prepare(
        'SELECT name, price, price_type, scope FROM services WHERE is_active = 1 ORDER BY sort_order ASC LIMIT 20'
      )
      .all<{ name: string; price: number | null; price_type: string; scope: string }>(),
  ]);

  const config: Record<string, string> = {};
  for (const row of configRows.results ?? []) config[row.key] = row.value;

  return {
    config,
    faq: faqRows.results ?? [],
    categories: catRows.results ?? [],
    products: prodRows.results ?? [],
    services: svcRows.results ?? [],
  };
}

function formatPrice(product: AssistantContext['products'][number]): string {
  if (product.price === null || product.price === undefined) return 'precio a consultar';
  return `${product.currency} ${product.price.toFixed(2)}`;
}

function stockLabel(status: string): string {
  if (status === 'in_stock') return 'disponible';
  if (status === 'on_order') return 'en pedido';
  return 'agotado';
}

/** Formatea el precio de un servicio para mostrar al cliente. */
function formatServicePrice(s: AssistantContext['services'][number]): string {
  if (s.price === null || s.price === undefined) return 'precio a consultar';
  return `${s.price.toFixed(2)}`;
}

/**
 * Genera la respuesta determinista usando datos reales de D1.
 * Devuelve el texto, la intención detectada y la fuente del dato.
 */
export function generateResponse(
  message: string,
  ctx: AssistantContext,
  history: { role: string; content: string }[] = []
): { text: string; intent: AssistantIntent; source: 'faq' | 'catalog' | 'template' } {
  const commercial = businessProposalReply(message, history);
  if (commercial) return {text:commercial,intent:'business_proposal',source:'template'};
  let intent = detectIntent(message);
  // Una respuesta corta ("sí", "48 voltios", "dos horas") continúa el asunto
  // de la conversación, en lugar de reiniciar el diálogo con una plantilla.
  const tokens = tokenize(message);
  // Solo una respuesta realmente breve puede heredar la intención anterior.
  // «Saber de la crisis mundial» no debe convertirse en el último tema de catálogo.
  const subject = normalize(message);
  const newTopic = isOutOfScopeMessage(message);
  if (intent === 'general' && message.length < 45 && tokens.length <= 1 && !newTopic) {
    const previous = [...history].reverse().find(entry =>
      entry.role === 'user' && !['general', 'greeting'].includes(detectIntent(entry.content)));
    if (previous) intent = detectIntent(previous.content);
  }

  if (isOutOfScopeMessage(message)) return {text:OUT_OF_SCOPE_REPLY,intent:'general',source:'template'};
  if (intent === 'currency_exchange') return {
    intent, source:'template',
    text:'Para informarte del dólar, euro y MLC en Cuba, necesito una tasa reciente verificada. La fuente de referencia para el mercado informal es elTOQUE: https://eltoque.com/tasas-de-cambio-cuba/mercado-informal/. No inventaré valores ni confundiré esa referencia con la tasa oficial del banco.'
  };

  // 1) Coincidencia con la FAQ configurada.
  // Solo se considera una FAQ si el usuario menciona al menos una palabra de
  // su tema concreto. De lo contrario, una FAQ que comparte términos genéricos
  // ("paneles solares") respondería consultas de otro tema.
  let best: { answer: string; score: number } | null = null;
  for (const faq of ctx.faq) {
    const topic = topicWords(faq.question);
    // Si el usuario no menciona ningún tema propio de la FAQ, se descarta.
    if (!topic.some((t) => tokens.includes(t))) continue;
    const score = faqScore(faq.question, tokens);
    if (score > 0 && (!best || score > best.score)) best = { answer: faq.answer, score };
  }
  if (best && best.score >= 2) {
    return { text: best.answer, intent, source: 'faq' };
  }

  // 2) Respuestas con datos del catálogo.
  switch (intent) {
    case 'greeting':
      return {
        text:
          (ctx.config.welcome_message || '').replaceAll('Energía Vital', 'Bonaire') ||
          '¡Hola! Soy el asistente de Bonaire. ¿En qué puedo ayudarte hoy?\n\n' +
            'Puedo ayudarte con:\n' +
            '- Equipos solares (inversores, paneles, baterías)\n' +
            '- Precios y disponibilidad del catálogo\n' +
            '- Citas de instalación, mantenimiento o reparación\n' +
            '- Dudas frecuentes sobre nuestros servicios\n\n' +
            '¿Qué necesitas?',
        intent,
        source: 'template',
      };

    case 'product_inquiry':
    case 'price_inquiry': {
      const current = normalize(message);
      const topic = ['bateria', 'inversor', 'panel', 'estacion', 'ecoflow', 'regulador', 'controlador']
        .find(word => current.includes(word));
      const terms = tokenize(message).filter(t => !GENERIC_DOMAIN_WORDS.has(t));
      const units = current.match(/\b\d+(?:[.,]\d+)?\s*(?:kw|kwh|w|ah|v)\b/g) || [];
      const scored = ctx.products.map(product => {
        const name = normalize(product.name);
        let score = topic && name.includes(topic) ? 5 : 0;
        score += terms.filter(t => name.includes(t)).length * 2;
        score += units.filter(t => name.includes(t.replace(/\s+/g, '')) || name.includes(t)).length * 3;
        return { product, score };
      }).filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5);
      const featured = scored.length ? scored.map(x => x.product) : (topic ? [] : ctx.products.slice(0, 5));
      const products = featured.map(p => `- ${p.name}: ${formatPrice(p)} (estado publicado: ${stockLabel(p.stock_status)})`);
      const line = products.length ? `\n\nEn el catálogo aparecen:\n${products.join('\n')}` :
        '\n\nNo encuentro un equipo que coincida claramente con tu consulta en el catálogo publicado.';
      return {
        text: `Te ayudo a comparar equipos y preparar una cotización.${line}\n\nLa disponibilidad y la compatibilidad se confirman con nuestro equipo antes de cualquier pedido. ¿Qué potencia, voltaje o modelo necesitas? Puedes enviar la solicitud en «Solicitar servicio».`,
        intent,
        source: products.length ? 'catalog' : 'template',
      };
    }

    case 'solar_advice': {
      const prior = history.filter(h => h.role === 'user').slice(-4).map(h => h.content).join(' ');
      const combined = normalize(prior + ' ' + message);
      const consumption = /\d+(?:[.,]\d+)?\s*(?:kw|kwh|watts?|amperios?|ampere|a\b)/.test(combined)
        || /nevera|refrigerador|aire acondicionado|equipos a alimentar/.test(combined);
      const autonomy = /\d+(?:[.,]\d+)?\s*(?:horas?|h\b)|autonomia|durante apagones/.test(combined);
      const choice = /solo respaldo|solo baterias|con paneles|tambien paneles|generacion solar/.test(combined);
      const question = !consumption
        ? 'Primero dime qué equipos necesitas alimentar y, si la conoces, su potencia en W o consumo diario en kWh.'
        : !autonomy
        ? '¿Cuántas horas de autonomía necesitas cuando falle la electricidad?'
        : !choice
        ? '¿Buscas solo respaldo con baterías o quieres generar también con paneles solares?'
        : 'Con esos datos podemos preparar una evaluación. Ve a «Asesor solar» para una estimación inicial y a «Solicitar servicio» para que un técnico revise el proyecto.';
      return {
        text: 'Vamos por partes para evitar recomendar equipos incompatibles. ' + question +
          '\n\nLa estimación no sustituye la revisión de cargas, picos de arranque, protecciones y compatibilidad eléctrica.',
        intent,
        source: 'template',
      };
    }

    case 'appointment':
      return {
        text:
          'Puedo ayudarte a agendar una cita. Dime:\n\n' +
          '1. ¿Qué servicio necesitas (instalación, mantenimiento, reparación o evaluación)?\n' +
          '2. ¿En qué ciudad o zona te encuentras?\n' +
          '3. ¿Qué fecha te gustaría?\n\n' +
          'Puedes registrar una solicitud en «Solicitar servicio». El equipo te confirmará fecha y horario; no reservaré una cita desde este chat sin registrarla.',
        intent,
        source: 'template',
      };

    case 'repair':
      return {
        text:
          'Lamento la avería. Para registrar tu solicitud de reparación necesito:\n\n' +
          '1. ¿Qué equipo falla (inversor, panel, batería u otro)?\n' +
          '2. ¿Marca y modelo?\n' +
          '3. ¿Qué error o síntoma presenta?\n' +
          '4. ¿En qué municipio está el equipo?\n\n' +
          '¿Me los puedes compartir?',
        intent,
        source: 'template',
      };

    case 'maintenance': {
      const svc = ctx.services
        .filter((s) => s.name.toLowerCase().includes('mantenimiento'))
        .map((s) => `-${s.name}: ${formatServicePrice(s)}`)
        .slice(0, 3);
      const priceLine =
        svc.length > 0 ? '\n\nServicios de mantenimiento disponibles:\n' + svc.join('\n') : '';
      return {
        text:
          'Ofrecemos mantenimiento preventivo para sistemas solares. Para agendar la visita necesito:\n\n' +
          '1. ¿Qué tipo de sistema tienes?\n' +
          '2. ¿Cuándo fue tu última instalación o mantenimiento?\n' +
          '3. ¿Qué síntoma o necesidad de mantenimiento presenta?\n\n' +
          'Si deseas una visita, regístrala en «Solicitar servicio» para que quede vinculada a tu cuenta.' + priceLine,
        intent,
        source: 'template',
      };
    }

    case 'complaint':
      return {
        text:
          'Tu opinión es importante. Cuéntanos qué ocurrió o qué te gustaría sugerir y registraremos ' +
          'tu mensaje para que nuestro equipo se ponga en contacto contigo.',
        intent,
        source: 'template',
      };

    case 'telegram':
      return {
        text:
          'Bonaire está preparando la conexión de este mismo asistente con Telegram y WhatsApp. ' +
          'Los enlaces de contacto todavía no garantizan un bot conectado ni que tu historial viaje entre canales. ' +
          'Puedes seguir utilizando el asistente web mientras completamos la integración segura.',
        intent,
        source: 'template',
      };

    case 'service_request': {
      const active = ctx.services.filter((s) => s.price_type !== null).slice(0, 10);
      if (!active.length) {
        return {
          text:
            'En este momento no tenemos servicios publicados. Déjanos tus datos y te contactamos ' +
            'para asesorarte.',
          intent,
          source: 'template',
        };
      }
      const lines = active.map(
        (s) =>
          `- ${s.name}: ${formatServicePrice(s)} ${s.scope ? '— ' + s.scope : ''}`,
      );
      return {
        text:
          'Ofrecemos los siguientes servicios:\n' +
          lines.join('\n') +
          '\n\n¿Qué servicio te interesa? Con gusto te ayudo a agendar.',
        intent,
        source: 'template',
      };
    }

    default: {
      const m = normalize(message);
      const business = /\b(?:bonaire|panel(?:es)?|solar(?:es)?|inversor(?:es)?|baterias?|electricidad|apagones?|energia|fotovoltaic[oa]s?|reparacion(?:es)?|mantenimiento|servicio(?:s)?|instalacion(?:es)?|catalogo)\b/.test(m);
      return {
        text: business
          ? 'Con gusto te ayudo con Bonaire. Puedo orientarte sobre equipos solares, baterías, inversores, precios del catálogo y servicios de instalación, mantenimiento o reparación. ¿Qué necesitas saber?'
          : OUT_OF_SCOPE_REPLY,
        intent, source:'template'
      };
    }
  }
}

/** Construye el prompt de sistema con el contexto real del negocio. */
export function buildSystemPrompt(ctx: AssistantContext): string {
  const business = ctx.config.business_name === 'Energía Vital' ? 'Bonaire' : ctx.config.business_name || 'Bonaire';
  const catalog = ctx.products
    .map((p) => `- ${p.name} (${formatPrice(p)}, ${stockLabel(p.stock_status)})`)
    .join('\n');
  const faq = ctx.faq.map((f) => `P: ${f.question}\nR: ${f.answer}`).join('\n');
  const svc = ctx.services
    .filter((s) => s.price_type === 'fixed' && s.price !== null)
    .map((s) => `- ${s.name}: ${formatServicePrice(s)} ${s.scope ? '— ' + s.scope : ''}`)
    .join('\n');

  return [
    `Eres el asistente de ${business}, una empresa comercial que ofrece actualmente soluciones solares y también recibe propuestas de suministro, promoción, distribución en Cuba y asociaciones en otros sectores.`,
    'Responde en español claro y cercano al contexto de Cuba. Guía paso a paso con una pregunta útil por turno.',
    'Alcance obligatorio: responde SOLO consultas relacionadas con Bonaire, sistemas solares, baterías, inversores, energía de respaldo, catálogo, servicios de instalación, mantenimiento y reparación, y propuestas comerciales de proveedores, promoción de marcas, distribución y asociaciones con Bonaire; además, las consultas de tasas de Cuba mediante el servicio de tasas autorizado.',
    'No preguntes el tipo de cliente o empresa durante una consulta informativa o asesoramiento. Solo al solicitar o contratar un servicio pregunta, si no se conoce ya, si es residencial, empresa estatal, mipyme u otro negocio privado. Ante una propuesta comercial pregunta por empresa, país y colaboración deseada, sin repetir información ya aportada. Nunca confirmes contratos, representación exclusiva ni aprobación de una asociación.',
    'Si te preguntan sobre crisis mundial, política, guerras, deportes u otros temas ajenos a Bonaire, no expliques esos temas ni compartas noticias: responde que no ofreces información sobre ellos y redirige de forma amable a productos y servicios de Bonaire.',
    'No inventes noticias actuales ni tasas cambiarias. Distingue el mercado informal elTOQUE de tasas oficiales y exige fuente reciente para cifras.',
    'La información del catálogo es orientativa: no inventes precios, existencias, garantía, compatibilidad, fechas ni trámites.',
    'Nunca afirmes que reservaste una cita, registraste una solicitud o realizaste un pedido: el chat no ejecuta esas acciones.',
    'La persona ya inició sesión. No vuelvas a pedir contraseña, teléfono ni dirección por el chat; indícale Mi perfil si necesita actualizarlos.',
    'Para solicitar cotización, instalación o visita indícale la sección Solicitar servicio. Para seguimiento, Mis solicitudes.',
    'Las estimaciones solares son orientativas: pide consumo, tensión, autonomía y propósito antes de hablar de dimensionamiento; exige revisión técnica.',
    'Si no tienes la información, indica que el equipo la confirmará contactando al cliente.',
    ctx.config.tone ? `Tono: ${ctx.config.tone}.` : '',
    catalog ? `Catálogo disponible:\n${catalog}` : '',
    svc ? `Servicios con precio fijo:\n${svc}` : '',
    faq ? `Preguntas frecuentes:\n${faq}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
