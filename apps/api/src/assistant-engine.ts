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
  | 'appointment'
  | 'repair'
  | 'maintenance'
  | 'product_inquiry'
  | 'complaint'
  | 'telegram'
  | 'service_request'
  | 'general';

const DEFAULT_WELCOME =
  '¡Hola! Soy el asistente de Energía Vital. ¿En qué puedo ayudarte hoy?';

export function detectIntent(message: string): AssistantIntent {
  const m = normalizeWithTypos(message);

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
  ctx: AssistantContext
): { text: string; intent: AssistantIntent; source: 'faq' | 'catalog' | 'template' } {
  const intent = detectIntent(message);
  const tokens = tokenize(message);

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
          ctx.config.welcome_message ||
          '¡Hola! Soy el asistente de Energía Vital. ¿En qué puedo ayudarte hoy?\n\n' +
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
      const prods = ctx.products
        .filter((p) => p.price !== null && p.price !== undefined)
        .map((p) => `- ${p.name}: ${formatPrice(p)} (${stockLabel(p.stock_status)})`)
        .slice(0, 8);
      const svc = ctx.services
        .filter((s) => s.price !== null && s.price !== undefined && s.price_type === 'fixed')
        .map((s) => `- ${s.name}: ${formatServicePrice(s)}`)
        .slice(0, 8);
      const lines = [...prods, ...svc];
      const header =
        lines.length > 0
          ? '\n\nEstos son algunos precios de referencia:\n' + lines.join('\n')
          : '';
      return {
        text:
          'Para darte un precio exacto necesitamos conocer los detalles de tu proyecto ' +
          '(potencia, equipos, zona, distancia). ' +
          '¿Quieres que te contactemos para una cotización personalizada?' + header,
        intent,
        source: 'template',
      };
    }

    case 'solar_advice':
      return {
        text:
          'Con gusto te ayudo a dimensionar tu sistema solar. Para darte una estimación necesito:\n\n' +
          '1. ¿Cuánta energía consume tu vivienda (o qué equipos quieres alimentar)?\n' +
          '2. ¿A qué voltaje funciona (120V, 220V)?\n' +
          '3. ¿Cuántas horas de autonomía necesitas?\n' +
          '4. ¿Solo respaldo con baterías o también paneles solares?\n\n' +
          'Con esos datos te indico el equipo recomendado.',
        intent,
        source: 'template',
      };

    case 'appointment':
      return {
        text:
          'Puedo ayudarte a agendar una cita. Dime:\n\n' +
          '1. ¿Qué servicio necesitas (instalación, mantenimiento, reparación o evaluación)?\n' +
          '2. ¿En qué ciudad o zona te encuentras?\n' +
          '3. ¿Qué fecha te gustaría?\n\n' +
          'Con eso consulto la disponibilidad y te propongo horarios.',
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
          '4. ¿Tu nombre y teléfono para contactarte?\n\n' +
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
          '3. ¿Tu zona y datos de contacto?\n\n' +
          '¿Te gustaría agendar una visita?' + priceLine,
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
          'Puedes continuar la conversación por Telegram con nuestro bot oficial. ' +
          '¿Quieres que te indique cómo contactarnos?',
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
      const cats = ctx.categories.map((c) => c.name).slice(0, 8);
      const catLine = cats.length ? `\n\nTrabajamos con: ${cats.join(', ')}.` : '';
      return {
        text:
          'Gracias por tu mensaje. Soy el asistente de Energía Vital. Puedo ayudarte con consultas de ' +
          'productos, precios, asesoría solar, citas, mantenimiento y reparaciones.' +
          catLine +
          '\n\n¿Sobre qué te gustaría saber?',
        intent,
        source: 'template',
      };
    }
  }
}

/** Construye el prompt de sistema con el contexto real del negocio. */
export function buildSystemPrompt(ctx: AssistantContext): string {
  const business = ctx.config.business_name || 'Energía Vital';
  const catalog = ctx.products
    .map((p) => `- ${p.name} (${formatPrice(p)}, ${stockLabel(p.stock_status)})`)
    .join('\n');
  const faq = ctx.faq.map((f) => `P: ${f.question}\nR: ${f.answer}`).join('\n');
  const svc = ctx.services
    .filter((s) => s.price_type === 'fixed' && s.price !== null)
    .map((s) => `- ${s.name}: ${formatServicePrice(s)} ${s.scope ? '— ' + s.scope : ''}`)
    .join('\n');

  return [
    `Eres el asistente de ${business}, una empresa de energía solar y equipos eléctricos.`,
    'Responde en español, de forma breve, amable y profesional. No inventes precios, productos ni fechas.',
    'Si no tienes la información, indica que el equipo la confirmará contactando al cliente.',
    ctx.config.tone ? `Tono: ${ctx.config.tone}.` : '',
    catalog ? `Catálogo disponible:\n${catalog}` : '',
    svc ? `Servicios con precio fijo:\n${svc}` : '',
    faq ? `Preguntas frecuentes:\n${faq}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
