import type { Env } from './types';

/** Límite básico por IP/ventana en D1. Complementar con Cloudflare WAF/Turnstile. */
export async function rateLimited(env: Env, request: Request, action: string, max: number, seconds: number): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const windowIndex = Math.floor(Date.now() / (seconds * 1000));
  const raw = new TextEncoder().encode(`${action}:${windowIndex}:${ip}:${env.JWT_SECRET || ''}`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)))
    .map(n => n.toString(16).padStart(2, '0')).join('');
  const key = `${action}:${hash}`;
  // Un único INSERT ... RETURNING contabiliza y lee el mismo incremento
  // atómicamente; evitar una SELECT posterior que puede observar el siguiente
  // intento concurrente y bloquear usuarios antes de agotar su cupo.
  const row = await env.DB.prepare(`INSERT INTO rate_buckets(bucket_key, hits, window_start) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET hits = hits + 1
    RETURNING hits`)
    .bind(key, new Date().toISOString()).first<{ hits: number }>();
  // Si D1 no confirma la escritura no concedemos un permiso de acceso gratuito.
  if (!row || !Number.isSafeInteger(row.hits) || row.hits < 1) {
    throw new Error('D1 no confirmó el contador de límite de acceso');
  }
  return row.hits > max;
}
