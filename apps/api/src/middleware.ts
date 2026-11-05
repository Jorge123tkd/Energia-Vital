/**
 * Middleware de autenticación JWT para Cloudflare Workers / Hono.
 *
 * - `requireAdminAuth`: requiere un token de admin válido en Authorization.
 * - `requireCustomerAuth`: requiere un token de customer válido.
 * - `optionalAuth`: adjunta el payload si hay token (no falla si falta).
 *
 * El payload verificado (JwtPayload) se guarda en c.set('user', payload).
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { Env } from './types';
import { JwtPayload, extractToken } from './auth';

type AppContext = Context<{ Bindings: Env; Variables: { user?: JwtPayload } }>;

/**
 * Requiere autenticación de admin. Si el token es inválido o no es admin → 401.
 */
export async function requireAdminAuth(c: AppContext, next: Next) {
  const authHeader = c.req.header('authorization');
  const payload = await extractToken(authHeader, c.env);
  if (!payload || payload.type !== 'admin') {
    return c.json({ error: 'No autorizado' }, 401);
  }
  c.set('user', payload);
  await next();
}

/**
 * Requiere autenticación de customer.
 */
export async function requireCustomerAuth(c: AppContext, next: Next) {
  const authHeader = c.req.header('authorization');
  const payload = await extractToken(authHeader, c.env);
  if (!payload || payload.type !== 'customer') {
    return c.json({ error: 'No autorizado' }, 401);
  }
  c.set('user', payload);
  await next();
}

/**
 * Auth opcional: si hay un token válido lo guarda, si no continúa sin user.
 */
export async function optionalAuth(c: AppContext, next: Next) {
  const authHeader = c.req.header('authorization');
  const payload = await extractToken(authHeader, c.env);
  if (payload) c.set('user', payload);
  await next();
}

/** Helper para obtener el user del contexto. */
export function getUser(c: AppContext): JwtPayload | undefined {
  return c.var.user;
}
