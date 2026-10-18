import { Hono } from 'hono';
import { Env } from '../types';

export const assistantRoutes = new Hono<{ Bindings: Env }>();

assistantRoutes.get('/config', async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT key, value FROM assistant_config').all();
  const config: Record<string, string> = {};
  for (const row of results ?? []) {
    config[row.key] = row.value;
  }
  return c.json({ config });
});

assistantRoutes.post('/message', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ session_id?: string; message: string; channel?: string; telegram_chat_id?: string }>();
  if (!body.message) return c.json({ error: 'Mensaje requerido' }, 400);

  const sessionId = body.session_id || crypto.randomUUID();
  const channel = (body.channel || 'web') as 'web' | 'telegram';

  await DB.prepare(
    'INSERT INTO assistant_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), sessionId, 'user', body.message, new Date().toISOString()).run();

  const existing = await DB.prepare('SELECT id FROM assistant_sessions WHERE id = ?').bind(sessionId).first();
  if (!existing) {
    await DB.prepare(
      'INSERT INTO assistant_sessions (id, channel, telegram_chat_id, context, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(sessionId, channel, body.telegram_chat_id || null, JSON.stringify({}), 'active', new Date().toISOString(), new Date().toISOString()).run();
  }

  const responseText = generateAssistantResponse(body.message);

  await DB.prepare(
    'INSERT INTO assistant_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), sessionId, 'assistant', responseText, new Date().toISOString()).run();

  return c.json({ session_id: sessionId, response: responseText, intent: detectIntent(body.message) });
});


function generateAssistantResponse(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('hola') || m.includes('buenas') || m.includes('start')) {
    return `¡Hola! Soy el asistente de Energía Vital. ¿En qué puedo ayudarte hoy?

Puedo ayudarte con:
- Recomendaciones de equipos solares (inversores, baterías, paneles)
- Consultar precios y disponibilidad del catálogo
- Agendar citas para instalación, mantenimiento o reparación
- Resolver dudas sobre nuestros servicios
- Enviarte a Telegram para seguir conversando

¿Qué necesitas?`;
  }

  if (m.includes('producto') || m.includes('catálogo') || m.includes('equipo') || m.includes('venta')) {
    return `Tenemos disponibles:
- Inversores solares e híbridos
- Paneles solares
- Baterías y sistemas de almacenamiento
- Estaciones EcoFlow
- Sistemas solares completos
- Accesorios y componentes

¿Qué tipo de equipo estás buscando?`;
  }

  if (m.includes('solar') || m.includes('panel') || m.includes('inversor') || m.includes('batería')) {
    return `Para recomendarte el mejor sistema solar necesito saber algunas cosas:

1. ¿Cuántos amperios consume tu vivienda (o qué aparatos quieres conectar)?
2. ¿A qué voltaje se mide (120V, 220V, etc.)?
3. ¿Cuántas horas de autonomía necesitas?
4. ¿Quieres solo respaldo con baterías o también paneles solares?

Con esta información puedo darte una estimación preliminar. ¿Quieres continuar?`;
  }

  if (m.includes('precio') || m.includes('cuánto cuesta') || m.includes('cotizar')) {
    return `Consulta nuestros precios en el catálogo de productos. Los precios pueden variar según disponibilidad y configuración. ¿Buscas algún equipo en particular?`;
  }

  if (m.includes('cita') || m.includes('agendar') || m.includes('reservar') || m.includes('visita')) {
    return `Puedo ayudarte a agendar una cita. Dime:

1. ¿Qué tipo de servicio necesitas (instalación, mantenimiento, reparación, evaluación)?
2. ¿En qué ciudad o zona estás?
3. ¿Qué fecha te gustaría?

Luego consultaré la disponibilidad y te propondré horarios.`;
  }

  if (m.includes('repar') || m.includes('avería') || m.includes('falla')) {
    return `Lamento que tengas una avería. Para registrar tu solicitud de reparación necesito:

1. ¿Qué equipo falla (inversor, panel, batería, otro)?
2. ¿Marca y modelo?
3. ¿Qué error o síntoma presenta?
4. ¿Tu nombre y teléfono para contactarte?

¿Puedes darme esos datos?`;
  }

  if (m.includes('mantenimiento')) {
    return `Ofrecemos mantenimiento preventivo para sistemas solares. Para agendar necesito:

1. ¿Qué tipo de sistema tienes?
2. ¿Cuándo fue la última instalación o mantenimiento?
3. ¿Tu zona y datos de contacto?

¿Te gustaría agendar una visita?`;
  }

  if (m.includes('queja') || m.includes('sugerencia') || m.includes('reclamo')) {
    return `Tu opinión es importante. Por favor cuéntanos qué sucedió o qué te gustaría sugerir. Registraré tu mensaje y nuestro equipo se pondrá en contacto contigo.`;
  }

  if (m.includes('telegram')) {
    return `Puedes continuar esta conversación por Telegram. Busca nuestro bot oficial o envíanos un mensaje. ¿Quieres que te dé el enlace?`;
  }

  return `Gracias por tu mensaje. Soy el asistente de Energía Vital. Puedo ayudarte con consultas de productos, precios, asesor solar, citas y reparaciones. ¿En qué necesitas ayuda específicamente?`;
}
function detectIntent(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('solar') || m.includes('panel') || m.includes('inversor') || m.includes('batería')) return 'solar_advice';
  if (m.includes('precio') || m.includes('cuánto') || m.includes('cotizar')) return 'price_inquiry';
  if (m.includes('cita') || m.includes('agendar') || m.includes('reservar') || m.includes('visita')) return 'appointment';
  if (m.includes('repar') || m.includes('avería') || m.includes('falla') || m.includes('error')) return 'repair';
  if (m.includes('mantenimiento')) return 'maintenance';
  if (m.includes('producto') || m.includes('catálogo') || m.includes('equipo')) return 'product_inquiry';
  if (m.includes('queja') || m.includes('sugerencia') || m.includes('reclamo')) return 'complaint';
  return 'general';
}