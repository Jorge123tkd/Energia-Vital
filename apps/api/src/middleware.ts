/** Validación de JWT + sesión activa en Cloudflare D1. */
import type { Context, Next } from 'hono';
import type { Env } from './types';
import { extractToken, type JwtPayload } from './auth';

type AppContext = Context<{ Bindings: Env; Variables: { user?: JwtPayload } }>;

export async function activeSession(env: Env, user: JwtPayload): Promise<boolean> {
  const session = await env.DB.prepare(
    'SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND user_type = ? AND revoked_at IS NULL AND expires_at > ?'
  ).bind(user.sid, user.user_id, user.type, new Date().toISOString()).first();
  return !!session;
}
export async function currentUser(c: AppContext): Promise<JwtPayload | null> {
  const payload = await extractToken(c.req.header('authorization'), c.env);
  return payload && await activeSession(c.env, payload) ? payload : null;
}
export async function requireCustomerAuth(c: AppContext, next: Next) {
  const user = await currentUser(c);
  if (!user || user.type !== 'customer') return c.json({ error: 'Debes iniciar sesión con una cuenta de cliente' }, 401);
  c.set('user', user);
  await next();
}
export async function requireAdminAuth(c: AppContext, next: Next) {
  const user = await currentUser(c);
  if (!user || user.type !== 'admin') return c.json({ error: 'No autorizado' }, 401);
  const admin = await c.env.DB.prepare("SELECT id FROM admin_users WHERE id = ? AND is_active = 1 AND role = 'admin'").bind(user.user_id).first();
  if (!admin) return c.json({ error: 'Sin permisos de administrador principal' }, 403);
  c.set('user', user);
  await next();
}
export async function optionalAuth(c: AppContext, next: Next) {
  const user = await currentUser(c);
  if (user) c.set('user', user);
  await next();
}
export function getUser(c: AppContext): JwtPayload | undefined {
  return c.var.user;
}
