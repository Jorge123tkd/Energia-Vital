import { Hono } from 'hono';
import { Env, AdminLoginResponse, CustomerLoginResponse, RefreshResponse } from '../types';
import { ensureAdminUser } from '../db';
import { hashPassword, comparePassword, generateTokenPair, verifyToken, extractToken } from '../auth';
import { JwtPayload } from '../auth';
import { sendLoginCode, sendToTelegram } from '../telegram-service';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user?: JwtPayload } }>();

/* ────────────────────────────────────────────────────────────────────────── */
/*  HELPERS                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const CODE_TTL_SECONDS = 5 * 60;     // 5 minutos
const LINK_TTL_SECONDS = 10 * 60;    // 10 minutos

function nowISO(): string {
  return new Date().toISOString();
}

/** Valida formato de email. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Valida formato de teléfono (mínimo 10 dígitos). */
function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{10,15}$/.test(phone);
}

/** Genera un código numérico de 6 dígitos. */
function generateCode(length: number = 6): string {
  const chars = '0123456789';
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) code += chars[array[i] % chars.length];
  return code;
}

/**
 * Verifica un JWT de refresh y devuelve el payload.
 * El refresh token contiene el mismo payload que el access (user_id, type, role).
 */
async function verifyRefreshToken(env: Env, refreshToken: string): Promise<JwtPayload | null> {
  return verifyToken(refreshToken, env.JWT_SECRET || '');
}

/** Crea un customer y devuelve el objeto normalizado. */
function normalizeCustomer(row: any): CustomerLoginResponse['user'] {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role || 'customer',
    phone_verified: !!row.phone_verified,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ADMIN AUTH                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

// Login del administrador
authRoutes.post('/login', async (c) => {
  const { DB, JWT_SECRET, ADMIN_PASSWORD_HASH } = c.env;
  const body = await c.req.json<{ email: string; password: string }>();

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  // 1) Verificar contra tabla admin_users
  const admin = await DB.prepare(
    'SELECT * FROM admin_users WHERE LOWER(email) = ? AND is_active = 1'
  )
    .bind(email)
    .first<any>();

  let valid = false;
  let adminId = '';

  if (admin) {
    valid = await comparePassword(password, admin.password_hash);
    adminId = admin.id;
  } else if (email === 'admin' && ADMIN_PASSWORD_HASH) {
    // Fallback: login con ADMIN_PASSWORD_HASH env
    valid = await comparePassword(password, ADMIN_PASSWORD_HASH);
    if (valid) {
      // Crear admin en DB si no existe
      await ensureAdminUser(DB, email, ADMIN_PASSWORD_HASH);
      adminId = email;
    }
  }

  if (!valid) return c.json({ error: 'Credenciales inválidas' }, 401);

  const secret = JWT_SECRET || '';
  const { access_token, refresh_token } = await generateTokenPair(
    c.env,
    adminId,
    'admin',
    admin?.role || 'admin',
  );

  const response: AdminLoginResponse = {
    user: { id: adminId, email: email, role: (admin?.role || 'admin') as any },
    token: access_token,
    access_token,
    refresh_token,
  };
  return c.json(response);
});

// Crear primer administrador (setup inicial, solo si no existen admins)
authRoutes.post('/setup', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ email: string; password: string }>();

  // Verificar que no existan ya admins
  const count = await DB.prepare('SELECT COUNT(*) as cnt FROM admin_users').first<any>();
  if (count && count.cnt > 0) {
    return c.json({ error: 'Ya existen administradores registados' }, 400);
  }

  const hash = await hashPassword(body.password);
  await ensureAdminUser(DB, body.email, hash);
  return c.json({ message: 'Administrador creado', email: body.email });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  CUSTOMER AUTH                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

// Registro de cliente
authRoutes.post('/register', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ name: string; email: string; password: string; phone?: string }>();

  if (!body.name?.trim()) return c.json({ error: 'El nombre es requerido' }, 400);
  if (!isValidEmail(body.email)) return c.json({ error: 'Email inválido' }, 400);
  if (body.password.length < 8) return c.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);

  const existing = await DB.prepare('SELECT id FROM customers WHERE email = ?').bind(body.email.toLowerCase()).first<any>();
  if (existing) return c.json({ error: 'El email ya está registrado' }, 409);

  const hash = await hashPassword(body.password);
  const id = crypto.randomUUID();
  const now = nowISO();

  await DB.prepare(
    `INSERT INTO customers (id, name, email, password_hash, role, phone_verified, telegram_chat_id, telegram_username, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'customer', 0, NULL, NULL, ?, ?)`
  )
    .bind(id, body.name.trim(), body.email.toLowerCase(), hash, now, now)
    .run();

  return c.json({ message: 'Cliente registrado. Verifica tu email y/o teléfono.', user: { id, name: body.name, email: body.email } });
});

// Login de cliente (email + password)
authRoutes.post('/customer/login', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ email: string; password: string }>();

  if (!body.email || !body.password) return c.json({ error: 'Email y contraseña requeridos' }, 400);

  const customer = await DB.prepare(
    'SELECT * FROM customers WHERE email = ? AND password_hash IS NOT NULL'
  )
    .bind(body.email.toLowerCase())
    .first<any>();

  if (!customer) return c.json({ error: 'Credenciales inválidas' }, 401);

  const valid = await comparePassword(body.password, customer.password_hash);
  if (!valid) return c.json({ error: 'Credenciales inválidas' }, 401);

  const { access_token, refresh_token } = await generateTokenPair(c.env, customer.id, 'customer', customer.role);

  return c.json({ user: normalizeCustomer(customer), access_token, refresh_token });
});

// Refresh de access token
authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  if (!body.refresh_token) return c.json({ error: 'Refresh token requerido' }, 400);

  const payload = await verifyRefreshToken(c.env, body.refresh_token);
  if (!payload) return c.json({ error: 'Token inválido o expirado' }, 401);

  const { access_token, refresh_token } = await generateTokenPair(c.env, payload.user_id, payload.type, payload.role);
  return c.json({ access_token, refresh_token });
});

// Logout
authRoutes.post('/logout', async (c) => {
  return c.json({ message: 'Sesión cerrada' });
});

// Me (customer)
authRoutes.get('/me', async (c) => {
  const user = await extractToken(c.req.header('authorization') ?? null, c.env);
  if (!user || user.type !== 'customer') return c.json({ error: 'No autorizado' }, 401);

  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  if (!customer) return c.json({ error: 'Customer no encontrado' }, 404);
  return c.json({ user: normalizeCustomer(customer) });
});

// Me (admin)
authRoutes.get('/admin/me', async (c) => {
  const user = await extractToken(c.req.header('authorization') ?? null, c.env);
  if (!user || user.type !== 'admin') return c.json({ error: 'No autorizado' }, 401);

  const admin = await c.env.DB.prepare('SELECT id, email, role, telegram_username FROM admin_users WHERE id = ?')
    .bind(user.user_id).first<any>();
  if (!admin) return c.json({ error: 'Admin no encontrado' }, 404);

  return c.json({ user: { id: admin.id, email: admin.email, role: admin.role, telegram_username: admin.telegram_username ?? null } });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  PHONE VERIFICATION                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

// Solicitar código de verificación
authRoutes.post('/phone/request', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ phone?: string; email?: string; telegram_chat_id?: string }>();

  if (!body.phone && !body.email && !body.telegram_chat_id) {
    return c.json({ error: 'Debe proporcionar phone, email o telegram_chat_id' }, 400);
  }

  let customerId: string | null = null;
  let customerName: string | null = null;
  let customerTelegramId: string | null = null;
  let phoneNumber: string | null = null;

  // Si se provee telegram_chat_id, buscar customer por ese chat
  if (body.telegram_chat_id) {
    const row = await DB.prepare('SELECT id, name, phone FROM customers WHERE telegram_chat_id = ?')
      .bind(body.telegram_chat_id).first<any>();
    if (row) {
      customerId = row.id;
      customerName = row.name;
      customerTelegramId = body.telegram_chat_id;
    }
  }

  // Si se provee email, buscar customer
  if (!customerId && body.email) {
    const row = await DB.prepare('SELECT id, name, phone, telegram_chat_id FROM customers WHERE email = ?')
      .bind(body.email.toLowerCase()).first<any>();
    if (row) {
      customerId = row.id;
      customerName = row.name;
      if (row.telegram_chat_id) customerTelegramId = row.telegram_chat_id;
      if (row.phone) phoneNumber = row.phone;
    }
  }

  // Si se provee phone, buscar o crear customer
  if (!customerId && body.phone) {
    if (!isValidPhone(body.phone)) return c.json({ error: 'Formato de teléfono inválido' }, 400);
    phoneNumber = body.phone;
    const row = await DB.prepare('SELECT id, name, telegram_chat_id FROM customers WHERE phone = ?')
      .bind(body.phone).first<any>();
    if (row) {
      customerId = row.id;
      customerName = row.name;
      if (row.telegram_chat_id) customerTelegramId = row.telegram_chat_id;
    } else {
      const id = crypto.randomUUID();
      const now = nowISO();
      await DB.prepare(
        `INSERT INTO customers (id, name, email, password_hash, role, phone, phone_verified, telegram_chat_id, telegram_username, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, 'customer', ?, 0, NULL, NULL, ?, ?)`
      ).bind(id, `Cliente ${body.phone}`, body.phone, now, now).run();
      customerId = id;
      customerName = `Cliente ${body.phone}`;
    }
  }

  if (!customerId) return c.json({ error: 'No se pudo identificar el cliente' }, 404);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

  await DB.prepare(
    `INSERT INTO phone_verifications (id, customer_id, phone, code, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).bind(crypto.randomUUID(), customerId, phoneNumber || '', code, expiresAt, nowISO()).run();

  let sentVia: string | null = null;
  if (customerTelegramId) {
    await sendLoginCode(c.env, customerTelegramId, code, customerName || undefined);
    sentVia = 'telegram';
  } else {
    sentVia = 'dev';
  }

  return c.json({
    message: 'Código de verificación enviado',
    sent_via: sentVia,
    ...(sentVia === 'dev' ? { code } : {}),
    expires_at: expiresAt,
  });
});

// Verificar código de teléfono
authRoutes.post('/phone/verify', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ phone?: string; email?: string; code: string }>();
  if (!body.code) return c.json({ error: 'Código requerido' }, 400);

  let customerId: string | null = null;
  let phoneNumber: string | null = null;

  if (body.email) {
    const row = await DB.prepare('SELECT id, phone FROM customers WHERE email = ?').bind(body.email.toLowerCase()).first<any>();
    if (row) { customerId = row.id; phoneNumber = row.phone; }
  }
  if (!customerId && body.phone) {
    phoneNumber = body.phone;
    const row = await DB.prepare('SELECT id FROM customers WHERE phone = ?').bind(body.phone).first<any>();
    if (row) customerId = row.id;
  }
  if (!customerId) return c.json({ error: 'Cliente no encontrado' }, 404);

  const targetPhone = phoneNumber || body.phone;

  const verification = await DB.prepare(
    `SELECT * FROM phone_verifications
     WHERE customer_id = ? AND phone = ? AND used = 0 AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(customerId, targetPhone, nowISO()).first<any>();

  if (!verification) return c.json({ error: 'Código inválido o expirado' }, 401);
  if (verification.code !== body.code) return c.json({ error: 'Código incorrecto' }, 401);

  await DB.prepare('UPDATE phone_verifications SET used = 1 WHERE id = ?').bind(verification.id).run();
  await DB.prepare('UPDATE customers SET phone_verified = 1 WHERE id = ?').bind(customerId).run();

  const { access_token, refresh_token } = await generateTokenPair(c.env, customerId, 'customer', 'customer');
  return c.json({ message: 'Teléfono verificado correctamente', access_token, refresh_token });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  TELEGRAM LOGIN FLOW                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

// Genera un código de enlace para vincular Telegram con un customer
authRoutes.post('/telegram/link', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ telegram_chat_id: string; name?: string; email?: string }>();

  if (!body.telegram_chat_id) return c.json({ error: 'telegram_chat_id requerido' }, 400);

  let customer = await DB.prepare('SELECT * FROM customers WHERE telegram_chat_id = ?')
    .bind(body.telegram_chat_id).first<any>();

  if (!customer) {
    const id = crypto.randomUUID();
    const now = nowISO();
    const name = body.name || `Cliente Telegram ${body.telegram_chat_id}`;
    await DB.prepare(
      `INSERT INTO customers (id, name, email, password_hash, role, phone_verified, telegram_chat_id, telegram_username, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'customer', 0, ?, NULL, ?, ?)`
    ).bind(id, name, body.email?.toLowerCase() || null, body.telegram_chat_id, now, now).run();
    customer = await DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first<any>();
  }

  const linkCode = generateCode(8);
  const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString();

  await DB.prepare(
    `INSERT INTO telegram_links (id, customer_id, link_code, used, expires_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).bind(crypto.randomUUID(), customer.id, linkCode, expiresAt, nowISO()).run();

  await sendLoginCode(c.env, body.telegram_chat_id, linkCode, customer.name);

  return c.json({
    message: 'Código de enlace enviado a Telegram',
    telegram_chat_id: body.telegram_chat_id,
    customer_id: customer.id,
  });
});

// Intercambia un link_code de Telegram por tokens JWT
authRoutes.post('/telegram/exchange', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ link_code: string }>();
  if (!body.link_code) return c.json({ error: 'link_code requerido' }, 400);

  const link = await DB.prepare(
    `SELECT * FROM telegram_links WHERE link_code = ? AND used = 0 AND expires_at > ?`
  ).bind(body.link_code, nowISO()).first<any>();

  if (!link) return c.json({ error: 'Código inválido o expirado' }, 401);

  await DB.prepare('UPDATE telegram_links SET used = 1 WHERE id = ?').bind(link.id).run();

  const customer = await DB.prepare('SELECT * FROM customers WHERE id = ?').bind(link.customer_id).first<any>();
  if (!customer) return c.json({ error: 'Customer no encontrado' }, 404);

  const { access_token, refresh_token } = await generateTokenPair(c.env, customer.id, 'customer', customer.role);

  return c.json({
    message: 'Login exitoso vía Telegram',
    user: normalizeCustomer(customer),
    access_token,
    refresh_token,
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  TELEGRAM WEBHOOK                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

// Webhook de Telegram para recibir actualizaciones
authRoutes.post('/telegram/webhook', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<any>();

  // Verificar firma del webhook
  if (c.env.TELEGRAM_WEBHOOK_SECRET) {
    const secretToken = c.req.header('x-telegram-bot-api-secret-token');
    if (secretToken !== c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: 'Forbidden' }, 403);
  }

  const message = body.message || body.edited_message;
  if (!message) return c.json({ ok: true });

  const chatId = message.chat?.id;
  const text = message.text || '';
  const from = message.from;
  const username = from?.username || null;

  if (chatId && text) {
    const lower = text.toLowerCase().trim();

    if (lower === '/start' || lower === '/start@energiavitalbot') {
      await sendToTelegram(
        c.env, chatId,
        `👋 ¡Hola! Bienvenido a Energía Vital.\n\n` +
          `Para acceder al sistema, necesitas un código de enlace.\n` +
          `Pide a tu administrador que te genere uno, o usa /login para solicitar uno.`,
      );
    } else if (lower === '/login') {
      const customer = await DB.prepare('SELECT id, name FROM customers WHERE telegram_chat_id = ?')
        .bind(String(chatId)).first<any>();

      if (!customer) {
        await sendToTelegram(
          c.env, chatId,
          `❌ No tienes una cuenta vinculada.\n\n` +
            `Pide a un administrador que te registre o genera un código de enlace desde la web.`,
        );
        return c.json({ ok: true });
      }

      const code = generateCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();
      await DB.prepare(
        `INSERT INTO phone_verifications (id, customer_id, phone, code, expires_at, used, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).bind(crypto.randomUUID(), customer.id, '', code, expiresAt, nowISO()).run();

      await sendLoginCode(c.env, chatId, code, customer.name);
    } else {
      await sendToTelegram(
        c.env, chatId,
        `ℹ️ Comando no reconocido.\nUsa /start para comenzar o /login para obtener un código de acceso.`,
      );
    }

    // Actualizar username del customer si existe
    if (from) {
      await DB.prepare('UPDATE customers SET telegram_username = ? WHERE telegram_chat_id = ?')
        .bind(username, String(chatId)).run();
    }
  }

  return c.json({ ok: true });
});


