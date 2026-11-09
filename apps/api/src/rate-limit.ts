import type { Env } from './types';

/** Límite básico por IP/ventana en D1. Complementar con Cloudflare WAF/Turnstile. */
export async function rateLimited(env: Env, request: Request, action: string, max: number, seconds: number): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const windowIndex = Math.floor(Date.now() / (seconds * 1000));
  const raw = new TextEncoder().encode(`${action}:${windowIndex}:${ip}:${env.JWT_SECRET || ''}`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)))
    .map(n => n.toString(16).padStart(2, '0')).join('');
  const key = `${action}:${hash}`;
  await env.DB.prepare(`INSERT INTO rate_buckets(bucket_key, hits, window_start) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET hits = hits + 1`)
    .bind(key, new Date().toISOString()).run();
  const row = await env.DB.prepare('SELECT hits FROM rate_buckets WHERE bucket_key = ?').bind(key).first<{ hits: number }>();
  return (row?.hits || 0) > max;
}
