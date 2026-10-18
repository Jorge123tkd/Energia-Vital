import { Hono } from 'hono';
import { Env } from '../types';
import { ensureAdminUser } from '../db';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Login del administrador
authRoutes.post('/login', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ email: string; password: string }>();

  const user = await DB.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').bind(body.email).first() as any;
  if (!user) return c.json({ error: 'Credenciales inválidas' }, 401);

  // Comparación simple de hash (en producción usar bcrypt/argon2)
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return c.json({ error: 'Credenciales inválidas' }, 401);

  const token = crypto.randomUUID();
  // En producción guardar el token con expiración en D1 o KV
  return c.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

// Crear primer administrador (setup inicial)
authRoutes.post('/setup', async (c) => {
  const { DB } = c.env;
  const body = await c.req.json<{ email: string; password: string }>();

  const hash = await hashPassword(body.password);
  await ensureAdminUser(DB, body.email, hash);

  return c.json({ message: 'Administrador creado', email: body.email });
});

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'energia-vital-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}