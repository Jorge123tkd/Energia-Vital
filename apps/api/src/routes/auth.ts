import { Hono } from 'hono';
import type { Env } from '../types';
import { REFRESH_TTL, comparePassword, extractToken, generateTokenPair, hashPassword, verifyToken, type JwtPayload } from '../auth';
import { activeSession } from '../middleware';
import { rateLimited } from '../rate-limit';

export const authRoutes = new Hono<{ Bindings: Env }>();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPhone = (phone: string) => /^\+?[0-9 ()-]{8,20}$/.test(phone) && (phone.match(/\d/g) || []).length >= 8;
const validPassword = (s: string) => typeof s === 'string' && s.length >= 10 && s.length <= 128;
const clean = (v: unknown, limit: number) => typeof v === 'string' ? v.trim().slice(0, limit) : '';

function safeCustomer(row: any) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, address: row.address,
    city: row.city, province: row.province, phone_verified: Boolean(row.phone_verified), role: 'customer' };
}
async function issue(env: Env, userId: string, type: 'customer' | 'admin', role: string) {
  const sid = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + REFRESH_TTL * 1000).toISOString();
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, user_type, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(sid, userId, type, now.toISOString(), expires).run();
  return generateTokenPair(env, userId, type, role, sid);
}
async function signedIn(c: any, type: 'admin' | 'customer'): Promise<JwtPayload | null> {
  const p = await extractToken(c.req.header('authorization'), c.env);
  if (!p || p.type !== type || !await activeSession(c.env, p)) return null;
  return p;
}

// Primer administrador: requiere secreto independiente configurado en Workers.
authRoutes.post('/setup', async c => {
  if (await rateLimited(c.env, c.req.raw, 'admin_setup', 5, 3600)) return c.json({ error: 'Demasiados intentos' }, 429);
  const setup = (c.env as Env & { ADMIN_SETUP_KEY?: string }).ADMIN_SETUP_KEY;
  if (!setup || setup.length < 32 || c.req.header('x-setup-key') !== setup) return c.json({ error: 'Configuración inicial no autorizada' }, 403);
  const existing = await c.env.DB.prepare('SELECT id FROM admin_users LIMIT 1').first();
  if (existing) return c.json({ error: 'El administrador ya fue configurado' }, 409);
  const b = await c.req.json<any>();
  const email = clean(b.email, 254).toLowerCase();
  if (!validEmail(email) || !validPassword(b.password)) return c.json({ error: 'Email o contraseña inválidos (mínimo 10 caracteres)' }, 400);
  await c.env.DB.prepare('INSERT INTO admin_users (id, email, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(crypto.randomUUID(), email, await hashPassword(b.password), 'admin', new Date().toISOString(), new Date().toISOString()).run();
  return c.json({ message: 'Administrador inicial creado' }, 201);
});

authRoutes.post('/login', async c => {
  if (await rateLimited(c.env, c.req.raw, 'admin_login', 10, 900)) return c.json({ error: 'Demasiados intentos' }, 429);
  const b = await c.req.json<any>();
  const admin = await c.env.DB.prepare('SELECT * FROM admin_users WHERE LOWER(email) = ? AND is_active = 1')
    .bind(clean(b.email, 254).toLowerCase()).first<any>();
  if (!admin || !await comparePassword(b.password || '', admin.password_hash)) return c.json({ error: 'Credenciales inválidas' }, 401);
  const tokens = await issue(c.env, admin.id, 'admin', admin.role);
  return c.json({ user: { id: admin.id, email: admin.email, role: admin.role }, token: tokens.access_token, ...tokens });
});

authRoutes.post('/register', async c => {
  if (await rateLimited(c.env, c.req.raw, 'register', 5, 3600)) return c.json({ error: 'Demasiados intentos de registro' }, 429);
  const b = await c.req.json<any>();
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 25);
  const address = clean(b.address, 250);
  const city = clean(b.city, 100);
  const province = clean(b.province, 100);
  if (name.length < 3 || !validEmail(email) || !validPhone(phone) || address.length < 6 || city.length < 2 || province.length < 2 || !validPassword(b.password))
    return c.json({ error: 'Completa nombre, email, teléfono, dirección, municipio, provincia y contraseña de al menos 10 caracteres' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE LOWER(email) = ?').bind(email).first();
  if (existing) return c.json({ error: 'Este correo ya está registrado' }, 409);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`INSERT INTO customers (id, name, email, phone, address, city, province, password_hash, role, phone_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'customer', 0, ?, ?)`)
      .bind(id, name, email, phone, address, city, province, await hashPassword(b.password), now, now).run();
  } catch { return c.json({ error: 'No se pudo registrar el usuario; revisa si el correo está duplicado' }, 409); }
  const tokens = await issue(c.env, id, 'customer', 'customer');
  return c.json({ user: { id, name, email, phone, address, city, province, role: 'customer', phone_verified: false }, ...tokens }, 201);
});

authRoutes.post('/customer/login', async c => {
  if (await rateLimited(c.env, c.req.raw, 'customer_login', 12, 900)) return c.json({ error: 'Demasiados intentos' }, 429);
  const b = await c.req.json<any>();
  const email = clean(b.email, 254).toLowerCase();
  if (!validEmail(email) || typeof b.password !== 'string') return c.json({ error: 'Credenciales inválidas' }, 401);
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE LOWER(email) = ? AND password_hash IS NOT NULL')
    .bind(email).first<any>();
  if (!customer || !await comparePassword(b.password, customer.password_hash)) return c.json({ error: 'Credenciales inválidas' }, 401);
  const tokens = await issue(c.env, customer.id, 'customer', 'customer');
  return c.json({ user: safeCustomer(customer), ...tokens });
});

authRoutes.post('/refresh', async c => {
  const b = await c.req.json<any>();
  const token = typeof b.refresh_token === 'string' ? await verifyToken(b.refresh_token, c.env.JWT_SECRET || '') : null;
  if (!token || token.kind !== 'refresh' || !await activeSession(c.env, token)) return c.json({ error: 'Sesión expirada' }, 401);
  const tokens = await generateTokenPair(c.env, token.user_id, token.type, token.role || token.type, token.sid);
  return c.json(tokens);
});

authRoutes.post('/logout', async c => {
  const bearer = await extractToken(c.req.header('authorization'), c.env);
  if (!bearer) return c.json({ error: 'No autorizado' }, 401);
  await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ?')
    .bind(new Date().toISOString(), bearer.sid, bearer.user_id).run();
  return c.json({ message: 'Sesión cerrada' });
});

authRoutes.get('/me', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  return customer ? c.json({ user: safeCustomer(customer) }) : c.json({ error: 'Cliente no encontrado' }, 404);
});

authRoutes.put('/me', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const b = await c.req.json<any>();
  const name = clean(b.name, 120), phone = clean(b.phone, 25), address = clean(b.address, 250);
  const city = clean(b.city, 100), province = clean(b.province, 100);
  if (name.length < 3 || !validPhone(phone) || address.length < 6 || city.length < 2 || province.length < 2)
    return c.json({ error: 'Completa nombre, teléfono, dirección, municipio y provincia' }, 400);
  await c.env.DB.prepare('UPDATE customers SET name = ?, phone = ?, address = ?, city = ?, province = ?, phone_verified = CASE WHEN phone = ? THEN phone_verified ELSE 0 END, updated_at = ? WHERE id = ?')
    .bind(name, phone, address, city, province, phone, new Date().toISOString(), user.user_id).run();
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  return c.json({ user: safeCustomer(customer) });
});

authRoutes.put('/password', async c => {
  const user = await signedIn(c, 'customer');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const b = await c.req.json<any>();
  if (!validPassword(b.new_password)) return c.json({ error: 'La contraseña nueva debe tener entre 10 y 128 caracteres' }, 400);
  const current = await c.env.DB.prepare('SELECT password_hash FROM customers WHERE id = ?').bind(user.user_id).first<any>();
  if (!current || !await comparePassword(b.current_password || '', current.password_hash)) return c.json({ error: 'Contraseña actual incorrecta' }, 403);
  await c.env.DB.prepare('UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(await hashPassword(b.new_password), new Date().toISOString(), user.user_id).run();
  await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND user_type = ? AND id != ?')
    .bind(new Date().toISOString(), user.user_id, 'customer', user.sid).run();
  return c.json({ message: 'Contraseña actualizada; otras sesiones cerradas' });
});

authRoutes.get('/admin/me', async c => {
  const user = await signedIn(c, 'admin');
  if (!user) return c.json({ error: 'No autorizado' }, 401);
  const admin = await c.env.DB.prepare('SELECT id, email, role FROM admin_users WHERE id = ? AND is_active = 1').bind(user.user_id).first();
  return admin ? c.json({ user: admin }) : c.json({ error: 'Administrador no autorizado' }, 403);
});

// Se retira el login sin contraseña vía teléfono o Telegram. Telegram queda como canal de notificaciones.
