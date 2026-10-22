import { Hono } from 'hono';
import { Env } from '../types';
import { detectIntent, generateResponse, loadAssistantContext } from '../assistant-engine';
import { callAI } from '../assistant-ai';

export const assistantRoutes = new Hono<{ Bindings: Env }>();

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 10;

interface MessageBody {
  session_id?: string;
  message?: string;
  channel?: string;
  telegram_chat_id?: string | number;
}

assistantRoutes.get('/config', async (c) => {
  try {
    const { DB } = c.env;
    const { results } = await DB.prepare('SELECT key, value FROM assistant_config').all<{
      key: string;
      value: string;
    }>();
    const config: Record<string, string> = {};
    for (const row of results ?? []) {
      config[row.key] = row.value;
    }
    return c.json({ config });
  } catch (e) {
    return c.json({ config: {}, error: 'Config no disponible' }, 200);
  }
});

/**
 * POST /api/assistant/message
 *
 * Orden de escritura (obligatorio por la FK de `assistant_messages`):
 *   1. Se asegura la sesion (`assistant_sessions`).
 *   2. Se persiste el mensaje del usuario (`assistant_messages`).
 *   3. Se invoca al proveedor de IA.
 *   4. Se persiste la respuesta del asistente.
 *
 * Los pasos 1 y 2 se ejecutan en un unico `DB.batch()` para que la sesion y el
 * mensaje se creen de forma atomica y nunca quede un mensaje huerfano.
 */
assistantRoutes.post('/message', async (c) => {
  const { DB } = c.env;

  let body: MessageBody;
  try {
    body = await c.req.json<MessageBody>();
  } catch {
    return c.json({ error: 'JSON invalido' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return c.json({ error: 'Mensaje requerido' }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) {
    return c.json({ error: 'Mensaje demasiado largo' }, 413);
  }

  const sessionId =
    typeof body.session_id === 'string' && body.session_id.trim()
      ? body.session_id.trim()
      : crypto.randomUUID();
  const channel: 'web' | 'telegram' = body.channel === 'telegram' ? 'telegram' : 'web';
  const telegramChatId =
    body.telegram_chat_id === undefined || body.telegram_chat_id === null
      ? null
      : String(body.telegram_chat_id);

  const now = new Date().toISOString();
  const userMessageId = crypto.randomUUID();
  const intent = detectIntent(message);

  try {
    // 2) Batch atomico: primero la sesion, luego el mensaje del usuario.
    //    El UPSERT de la sesion la crea o la actualiza en una sola sentencia, de
    //    modo que sea idempotente y seguro ante peticiones concurrentes con el
    //    mismo session_id (evita el UNIQUE constraint de assistant_sessions.id).
    const statements: D1PreparedStatement[] = [];

    statements.push(
      DB.prepare(
        `INSERT INTO assistant_sessions
           (id, channel, telegram_chat_id, context, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           updated_at        = excluded.updated_at,
           status           = 'active',
           telegram_chat_id = COALESCE(excluded.telegram_chat_id, assistant_sessions.telegram_chat_id)`
      ).bind(sessionId, channel, telegramChatId, JSON.stringify({}), 'active', now, now)
    );

    statements.push(
      DB.prepare(
        `INSERT INTO assistant_messages (id, session_id, role, content, intent, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(userMessageId, sessionId, 'user', message, intent, now)
    );

    await DB.batch(statements);

    // 3) Cargar el contexto real del negocio (config, FAQ, catalogo).
    let ctx;
    try {
      ctx = await loadAssistantContext(DB);
    } catch (e) {
      console.error('No se pudo cargar el contexto del asistente:', e);
      ctx = { config: {}, faq: [], categories: [], products: [] };
    }

    // 4) Historial reciente de la sesion para dar contexto a la IA.
    const historyRows = await DB.prepare(
      `SELECT role, content FROM assistant_messages
       WHERE session_id = ? AND id != ?
       ORDER BY created_at DESC LIMIT ?`
    )
      .bind(sessionId, userMessageId, MAX_HISTORY_MESSAGES)
      .all<{ role: string; content: string }>();

    const history = (historyRows.results ?? []).reverse();

    // 5) Responder: IA si esta disponible y habilitada; si no, motor determinista.
    const ai = await callAI(c.env, ctx, history, message);
    const fallback = generateResponse(message, ctx);
    const responseText = ai.text || fallback.text;
    const source = ai.text ? ('ai' as const) : fallback.source;

    // 6) Persistir la respuesta del asistente.
    const assistantMessageId = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO assistant_messages (id, session_id, role, content, intent, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        assistantMessageId,
        sessionId,
        'assistant',
        responseText,
        fallback.intent,
        JSON.stringify({ source, provider: ai.provider, model: ai.model || null }),
        new Date().toISOString()
      )
      .run();

    return c.json({
      session_id: sessionId,
      response: responseText,
      intent: fallback.intent,
      source,
      message_id: assistantMessageId,
    });
  } catch (e) {
    console.error('Error procesando mensaje del asistente:', e);
    return c.json({ error: 'Error interno procesando el mensaje' }, 500);
  }
});

/** Historial de una sesion del asistente. */
assistantRoutes.get('/session/:id/messages', async (c) => {
  try {
    const { DB } = c.env;
    const id = c.req.param('id');
    const { results } = await DB.prepare(
      'SELECT id, role, content, intent, created_at FROM assistant_messages WHERE session_id = ? ORDER BY created_at ASC'
    )
      .bind(id)
      .all();

    return c.json({ session_id: id, messages: results ?? [] });
  } catch (e) {
    console.error('Error obteniendo historial del asistente:', e);
    return c.json({ error: 'No se pudo obtener el historial' }, 500);
  }
});
