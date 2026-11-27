import { Hono } from 'hono';
import { Env } from '../types';
import { requireAdminAuth, optionalAuth, getUser } from '../middleware';
import { sendToTelegram } from '../telegram-service';

export const giveawaysRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

/* ────────────────────────────────────────────────────────────────────────── */
/*  ADMIN — CRUD DE SORTEOS                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

// Listar todos los sorteos (admin)
giveawaysRoutes.get('/', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const { results } = await DB.prepare('SELECT * FROM giveaways ORDER BY created_at DESC').all<any>();
  return c.json({ giveaways: results ?? [] });
});

// Crear un sorteo (admin)
giveawaysRoutes.post('/', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const user = getUser(c);
  const b = await c.req.json<any>();

  if (!b.title || !b.prize || !b.start_date || !b.end_date) {
    return c.json({ error: 'title, prize, start_date y end_date son requeridos' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await DB.prepare(
    `INSERT INTO giveaways (id, title, description, prize, prize_image_url, entry_type,
     requires_email, requires_phone, requires_telegram, start_date, end_date,
     max_participants, max_winner_entries, num_winners, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, b.title, b.description || null, b.prize, b.prize_image_url || null,
      b.entry_type || 'any', b.requires_email ? 1 : 0, b.requires_phone ? 1 : 0,
      b.requires_telegram ? 1 : 0, b.start_date, b.end_date, b.max_participants || null,
      b.max_winner_entries || 1, b.num_winners || 1, b.status || 'draft',
      user!.user_id, now, now,
    )
    .run();

  return c.json({ id, message: 'Sorteo creado' });
});

// Obtener / actualizar / eliminar un sorteo (admin)
giveawaysRoutes.get('/:id', requireAdminAuth, async (c) => {
  const giveaway = await c.env.DB.prepare('SELECT * FROM giveaways WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!giveaway) return c.json({ error: 'Sorteo no encontrado' }, 404);
  return c.json({ giveaway });
});

giveawaysRoutes.patch('/:id', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const b = await c.req.json<any>();
  const now = new Date().toISOString();
  const id = c.req.param('id');

  await DB.prepare(
    `UPDATE giveaways SET
     title = COALESCE(?, title), description = COALESCE(?, description),
     prize = COALESCE(?, prize), prize_image_url = COALESCE(?, prize_image_url),
     entry_type = COALESCE(?, entry_type), requires_email = COALESCE(?, requires_email),
     requires_phone = COALESCE(?, requires_phone), requires_telegram = COALESCE(?, requires_telegram),
     start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
     max_participants = COALESCE(?, max_participants), max_winner_entries = COALESCE(?, max_winner_entries),
     num_winners = COALESCE(?, num_winners), status = COALESCE(?, status), updated_at = ?
     WHERE id = ?`
  )
    .bind(
      b.title || null, b.description || null, b.prize || null, b.prize_image_url || null,
      b.entry_type || null, b.requires_email !== undefined ? (b.requires_email ? 1 : 0) : null,
      b.requires_phone !== undefined ? (b.requires_phone ? 1 : 0) : null,
      b.requires_telegram !== undefined ? (b.requires_telegram ? 1 : 0) : null,
      b.start_date || null, b.end_date || null, b.max_participants || null,
      b.max_winner_entries || null, b.num_winners || null, b.status || null, now, id,
    )
    .run();

  return c.json({ message: 'Sorteo actualizado' });
});

giveawaysRoutes.delete('/:id', requireAdminAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM giveaways WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ message: 'Sorteo eliminado' });
});

// Activar / desactivar
giveawaysRoutes.post('/:id/activate', requireAdminAuth, async (c) => {
  await c.env.DB.prepare('UPDATE giveaways SET status = ? WHERE id = ?').bind('active', c.req.param('id')).run();
  return c.json({ message: 'Sorteo activado' });
});

giveawaysRoutes.post('/:id/deactivate', requireAdminAuth, async (c) => {
  await c.env.DB.prepare('UPDATE giveaways SET status = ? WHERE id = ?').bind('cancelled', c.req.param('id')).run();
  return c.json({ message: 'Sorteo desactivado' });
});

// Listar participantes y ganadores
giveawaysRoutes.get('/:id/participants', requireAdminAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM giveaway_participants WHERE giveaway_id = ? ORDER BY created_at ASC'
  ).bind(c.req.param('id')).all<any>();
  return c.json({ participants: results ?? [] });
});

giveawaysRoutes.get('/:id/winners', requireAdminAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM giveaway_winners WHERE giveaway_id = ? ORDER BY position ASC'
  ).bind(c.req.param('id')).all<any>();
  return c.json({ winners: results ?? [] });
});

// Realizar el sorteo (draw winners)
giveawaysRoutes.post('/:id/draw', requireAdminAuth, async (c) => {
  const { DB } = c.env;
  const giveawayId = c.req.param('id');

  const giveaway = await DB.prepare('SELECT * FROM giveaways WHERE id = ?').bind(giveawayId).first<any>();
  if (!giveaway) return c.json({ error: 'Sorteo no encontrado' }, 404);
  if (giveaway.status !== 'active') return c.json({ error: 'El sorteo no está activo' }, 400);

  const now = new Date().toISOString();
  if (giveaway.end_date > now) return c.json({ error: 'El sorteo aún no ha terminado' }, 400);

  const participants = await DB.prepare(
    'SELECT * FROM giveaway_participants WHERE giveaway_id = ?'
  ).bind(giveawayId).all<any>();

  const partList = participants.results ?? [];
  if (partList.length === 0) return c.json({ error: 'No hay participantes' }, 400);

  const numWinners = Math.min(giveaway.num_winners || 1, partList.length);
  const winners: any[] = [];

  // Seleccionar ganadores aleatoriamente
  const shuffled = [...partList].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numWinners; i++) {
    const participant = shuffled[i];
    const winnerId = crypto.randomUUID();
    const winner = {
      id: winnerId,
      giveaway_id: giveawayId,
      participant_id: participant.id,
      customer_id: participant.customer_id || null,
      position: i + 1,
      prize: giveaway.prize,
      notified: 0,
      claimed: 0,
    };
    await DB.prepare(
      `INSERT INTO giveaway_winners (id, giveaway_id, participant_id, customer_id, position, prize, notified, claimed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`
    )
      .bind(winnerId, giveawayId, participant.id, participant.customer_id || null, i + 1, giveaway.prize, now)
      .run();
    winners.push(winner);
  }

  // Marcar sorteo como ended
  await DB.prepare('UPDATE giveaways SET status = ? WHERE id = ?').bind('ended', giveawayId).run();

  // Notificar ganadores
  for (const winner of winners) {
    const participant = partList.find((p: any) => p.id === winner.participant_id);
    if (participant?.telegram_chat_id) {
      await sendToTelegram(
        c.env, participant.telegram_chat_id,
        `🎉 ¡Felicidades! Has ganado el sorteo "${giveaway.title}".\n\nPremio: ${giveaway.prize}\nContacta con un administrador para reclamar tu premio.`,
        { parse_mode: 'HTML' },
      );
      await DB.prepare('UPDATE giveaway_winners SET notified = 1 WHERE id = ?').bind(winner.id).run();
    }
    // Crear notificación
    await DB.prepare(
      `INSERT INTO notifications (id, user_id, user_type, type, title, message, is_read, created_at)
       VALUES (?, ?, 'customer', 'giveaway_win', ?, ?, 0, ?)`
    )
      .bind(crypto.randomUUID(), participant?.customer_id || participant.id, '¡Has ganado un sorteo!', `Ganaste: ${giveaway.prize}`, now)
      .run();
  }

  return c.json({ message: `Sorteo completado. ${numWinners} ganador(es).`, winners, participants_count: partList.length });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  PÚBLICO / CUSTOMER                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

// Listar sorteos activos (público)
giveawaysRoutes.get('/public/list', optionalAuth, async (c) => {
  const now = new Date().toISOString();
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM giveaways WHERE status = 'active' AND end_date > ? ORDER BY start_date DESC`
  ).bind(now).all<any>();
  return c.json({ giveaways: results ?? [] });
});

// Detalles de un sorteo (público)
giveawaysRoutes.get('/public/:id', optionalAuth, async (c) => {
  const now = new Date().toISOString();
  const giveaway = await c.env.DB.prepare(
    `SELECT * FROM giveaways WHERE id = ? AND status = 'active' AND end_date > ?`
  ).bind(c.req.param('id'), now).first<any>();
  if (!giveaway) return c.json({ error: 'Sorteo no encontrado o inactivo' }, 404);

  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM giveaway_participants WHERE giveaway_id = ?'
  ).bind(c.req.param('id')).first<any>();

  return c.json({ giveaway, participants_count: countResult?.cnt || 0 });
});

// Participar en un sorteo (público)
giveawaysRoutes.post('/public/:id/participate', optionalAuth, async (c) => {
  const { DB } = c.env;
  const giveawayId = c.req.param('id');
  const user = getUser(c);
  if (!user || user.type !== 'customer') return c.json({ error: 'Inicia sesión para participar' }, 401);
  const profile = await DB.prepare('SELECT id, name, email, phone, telegram_chat_id, telegram_username FROM customers WHERE id = ?')
    .bind(user.user_id).first<any>();
  if (!profile) return c.json({ error: 'Cuenta de cliente inexistente' }, 401);

  const giveaway = await DB.prepare('SELECT * FROM giveaways WHERE id = ?').bind(giveawayId).first<any>();
  if (!giveaway) return c.json({ error: 'Sorteo no encontrado' }, 404);
  if (giveaway.status !== 'active') return c.json({ error: 'El sorteo no está activo' }, 400);

  const now = new Date().toISOString();
  if (now < giveaway.start_date || now > giveaway.end_date) {
    return c.json({ error: 'El sorteo no está en curso' }, 400);
  }

  // Los datos se obtienen del perfil autenticado, no del cuerpo manipulable de la petición.
  const name = profile.name;
  const email = profile.email;
  const phone = profile.phone;
  const telegramChatId = profile.telegram_chat_id;
  const telegramUsername = profile.telegram_username;
  const customerId: string = user.user_id;

  if (giveaway.requires_email && !email) return c.json({ error: 'Este sorteo requiere email' }, 400);
  if (giveaway.requires_phone && !phone) return c.json({ error: 'Este sorteo requiere teléfono' }, 400);
  if (giveaway.requires_telegram) {
    // Evitar declarar como verificado un chat_id que nunca se vinculó de forma segura.
    return c.json({ error: 'La participación por Telegram estará disponible cuando se habilite la vinculación verificada' }, 409);
  }
  if (!name) return c.json({ error: 'El nombre es requerido' }, 400);

  // Verificar si ya participa
  const existing = await DB.prepare(
    'SELECT id FROM giveaway_participants WHERE giveaway_id = ? AND (customer_id = ? OR email = ? OR phone = ? OR telegram_chat_id = ?)'
  ).bind(giveawayId, customerId || null, email || null, phone || null, telegramChatId || null).first<any>();
  if (existing) return c.json({ error: 'Ya participas en este sorteo' }, 409);

  // Verificar límite de participantes
  if (giveaway.max_participants) {
    const count = await DB.prepare('SELECT COUNT(*) as cnt FROM giveaway_participants WHERE giveaway_id = ?')
      .bind(giveawayId).first<any>();
    if (count && count.cnt >= giveaway.max_participants) {
      return c.json({ error: 'El sorteo está completo' }, 400);
    }
  }

  const id = crypto.randomUUID();
  await DB.prepare(
    `INSERT INTO giveaway_participants (id, giveaway_id, customer_id, name, email, phone, telegram_chat_id, telegram_username, entry_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  )
    .bind(id, giveawayId, customerId, name, email || null, phone || null, telegramChatId || null, telegramUsername || null, now)
    .run();

  return c.json({
    message: 'Te has unido al sorteo',
    participant: { id, name, email, phone, giveaway_id: giveawayId, entry_count: 1 },
  });
});

