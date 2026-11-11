import { Hono } from 'hono';
import type { Env } from '../types';
import { detectIntent, generateResponse, loadAssistantContext } from '../assistant-engine';
import { callAI } from '../assistant-ai';
import { getUser, requireCustomerAuth } from '../middleware';
import { rateLimited } from '../rate-limit';
import { advanceSolarGuidance, type SolarState } from '../solar-guidance';

export const assistantRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();
assistantRoutes.use('*', requireCustomerAuth);

assistantRoutes.get('/config', async c => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM assistant_config').all<{ key: string; value: string }>();
  return c.json({ config: Object.fromEntries((results || []).map(r => [r.key, r.value])) });
});


/** Historial privado: nunca devuelve chats de otro usuario ni sesiones de Telegram. */
assistantRoutes.get('/sessions', async c => {
  const userId = getUser(c)!.user_id;
  const page = Math.min(10000, Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1));
  const pageSize = 50;
  const {results} = await c.env.DB.prepare(`
    SELECT s.id, s.created_at, s.updated_at, s.title,
      (SELECT substr(m.content,1,90) FROM assistant_messages m
        WHERE m.session_id=s.id AND m.role='user'
        ORDER BY m.created_at ASC, m.rowid ASC LIMIT 1) AS first_message,
      (SELECT count(*) FROM assistant_messages m WHERE m.session_id=s.id) AS message_count
    FROM assistant_sessions s
    WHERE s.customer_id=? AND s.channel='web'
    ORDER BY s.updated_at DESC, s.id DESC LIMIT ? OFFSET ?
  `).bind(userId,pageSize+1,(page-1)*pageSize).all();
  const list=results||[];
  return c.json({
    sessions:list.slice(0,pageSize).map((item:any)=>({
      ...item, title:item.title || item.first_message || 'Nueva conversación'
    })),
    page,has_more:list.length>pageSize
  });
});

assistantRoutes.post('/sessions', async c => {
  const userId=getUser(c)!.user_id,id=crypto.randomUUID(),now=new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO assistant_sessions
    (id,customer_id,channel,telegram_chat_id,context,status,created_at,updated_at,title)
    VALUES (?,?,'web',NULL,'{}','active',?,?,NULL)`).bind(id,userId,now,now).run();
  return c.json({session:{id,title:'Nueva conversación',created_at:now,updated_at:now,message_count:0}},201);
});

assistantRoutes.patch('/session/:id', async c => {
  const id=c.req.param('id'),userId=getUser(c)!.user_id;
  const body=await c.req.json<any>().catch(()=>null);
  if(!body || typeof body.title!=='string' || body.title.trim().length<2 || body.title.trim().length>90)
    return c.json({error:'El nombre debe tener entre 2 y 90 caracteres.'},400);
  const result=await c.env.DB.prepare(`UPDATE assistant_sessions SET title=?,updated_at=?
    WHERE id=? AND customer_id=? AND channel='web'`)
    .bind(body.title.trim(),new Date().toISOString(),id,userId).run();
  return result.meta?.changes?c.json({message:'Conversación renombrada.'}):c.notFound();
});

assistantRoutes.delete('/session/:id', async c => {
  const id=c.req.param('id'),userId=getUser(c)!.user_id;
  const result=await c.env.DB.prepare(`DELETE FROM assistant_sessions
    WHERE id=? AND customer_id=? AND channel='web'`).bind(id,userId).run();
  return result.meta?.changes?c.json({message:'Conversación eliminada.'}):c.notFound();
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
        WHERE assistant_sessions.customer_id = excluded.customer_id AND assistant_sessions.channel = 'web'`)
        .bind(sessionId, user.user_id, now, now),
      DB.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, intent, created_at)
        SELECT ?, id, 'user', ?, ?, ? FROM assistant_sessions WHERE id = ? AND customer_id = ? AND channel = 'web'`)
        .bind(messageId, message, intent, now, sessionId, user.user_id),
    ]);
    if (!batch[1].meta?.changes) return c.json({ error: 'Esta conversación pertenece a otra cuenta' }, 403);

    // El asesoramiento guiado conserva el avance en D1 para esta conversación
    // y no depende de una respuesta probabilística del modelo de IA.
    const row = await DB.prepare('SELECT context FROM assistant_sessions WHERE id = ? AND customer_id = ?')
      .bind(sessionId, user.user_id).first<{ context: string }>();
    let sessionContext: Record<string, any> = {};
    try {
      const parsed = JSON.parse(row?.context || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) sessionContext = parsed;
    } catch { /* contexto anterior malformado; iniciar limpio */ }
    const guided = advanceSolarGuidance(message, sessionContext.solar as SolarState | undefined);
    if (guided.handled) {
      if (guided.state) sessionContext.solar = guided.state;
      else delete sessionContext.solar;
      const replyId = crypto.randomUUID();
      await DB.batch([
        DB.prepare('UPDATE assistant_sessions SET context = ?, updated_at = ? WHERE id = ? AND customer_id = ?')
          .bind(JSON.stringify(sessionContext), new Date().toISOString(), sessionId, user.user_id),
        DB.prepare(`INSERT INTO assistant_messages (id, session_id, role, content, intent, metadata, created_at)
          VALUES (?, ?, 'assistant', ?, 'solar_advice', ?, ?)`)
          .bind(replyId, sessionId, guided.reply, JSON.stringify({ source: 'guided' }), new Date().toISOString()),
      ]);
      return c.json({ session_id: sessionId, response: guided.reply, source: 'guided', intent: 'solar_advice', message_id: replyId });
    }

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
  const existing = await c.env.DB.prepare('SELECT id FROM assistant_sessions WHERE id = ? AND customer_id = ? AND channel = 'web'')
    .bind(session, user.user_id).first();
  if (!existing) return c.json({ error: 'Conversación no encontrada' }, 404);
  const { results } = await c.env.DB.prepare('SELECT id, role, content, intent, created_at FROM assistant_messages WHERE session_id = ? ORDER BY created_at')
    .bind(session).all();
  return c.json({ session_id: session, messages: results ?? [] });
});
