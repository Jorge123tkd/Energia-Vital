import { Hono } from 'hono';
import type { Env } from '../types';
import { detectIntent, generateResponse, loadAssistantContext } from '../assistant-engine';
import { callAI } from '../assistant-ai';
import { getUser, requireCustomerAuth } from '../middleware';
import { rateLimited } from '../rate-limit';

export const assistantRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
assistantRoutes.use('*', requireCustomerAuth);

assistantRoutes.get('/config', async c => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM assistant_config').all<{ key: string; value: string }>();
  return c.json({ config: Object.fromEntries((results || []).map(r => [r.key, r.value])) });
});

assistantRoutes.post('/message', async c => {
  if (await rateLimited(c.env, c.req.raw, 'assistant', 30, 600)) return c.json({ error: 'Se alcanzó el límite temporal de mensajes' }, 429);
  const user = getUser(c)!;
  const body = await c.req.json<any>().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 4000) return c.json({ error: 'El mensaje debe tener entre 1 y 4000 caracteres' }, 400);
  const sessionId = typeof body?.session_id === 'string' && /^[\w-]{8,80}$/.test(body.session_id) ? body.session_id : crypto.randomUUID();
  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();
  const intent = detectIntent(message);
  const { DB } = c.env;
  try {
    const batch = await DB.batch([
      DB.prepare(`INSERT INTO assistant_sessions (id, customer_id, channel, telegram_chat_id, context, status, created_at, updated_at)
        VALUES (?, ?, 'web', NULL, '{}', 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
        WHERE assistant_sessions.customer_id = excluded.customer_id`)
        .bind(sessionId, user.user_id, now, now),
      DB.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, intent, created_at)
        SELECT ?, id, 'user', ?, ?, ? FROM assistant_sessions WHERE id = ? AND customer_id = ?`)
        .bind(messageId, message, intent, now, sessionId, user.user_id),
    ]);
    if (!batch[1].meta?.changes) return c.json({ error: 'Esta conversación pertenece a otra cuenta' }, 403);

    let context;
    try { context = await loadAssistantContext(DB); }
    catch { context = { config: {}, faq: [], categories: [], products: [], services: [] }; }
    const { results } = await DB.prepare(`SELECT role, content FROM assistant_messages WHERE session_id = ? AND id != ? ORDER BY created_at DESC LIMIT 10`)
      .bind(sessionId, messageId).all<{ role: string; content: string }>();
    const history = (results || []).reverse();
    const ai = await callAI(c.env, context, history, message);
    const fallback = generateResponse(message, context, history);
    const reply = ai.text || fallback.text;
    const source = ai.text ? 'ai' : fallback.source;
    const replyId = crypto.randomUUID();
    await DB.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, intent, metadata, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?)`)
      .bind(replyId, sessionId, reply, fallback.intent, JSON.stringify({ source }), new Date().toISOString()).run();
    return c.json({ session_id: sessionId, response: reply, source, intent: fallback.intent, message_id: replyId });
  } catch (error) {
    console.error('Fallo del asistente', error);
    return c.json({ error: 'No se pudo procesar el mensaje' }, 500);
  }
});

assistantRoutes.get('/session/:id/messages', async c => {
  const user = getUser(c)!;
  const session = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM assistant_sessions WHERE id = ? AND customer_id = ?')
    .bind(session, user.user_id).first();
  if (!existing) return c.json({ error: 'Conversación no encontrada' }, 404);
  const { results } = await c.env.DB.prepare('SELECT id, role, content, intent, created_at FROM assistant_messages WHERE session_id = ? ORDER BY created_at')
    .bind(session).all();
  return c.json({ session_id: session, messages: results ?? [] });
});
