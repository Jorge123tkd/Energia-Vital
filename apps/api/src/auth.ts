/** Tokens de acceso y sesiones para Cloudflare Workers (Web Crypto). */
export interface JwtPayload {
  user_id: string;
  type: 'customer' | 'admin';
  role?: string;
  sid: string;
  kind: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;
const PBKDF2_ITERATIONS = 310_000;

function toHex(buffer: ArrayBufferLike): string {
  return Array.from(new Uint8Array(buffer)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Hash inválido');
  return new Uint8Array(hex.match(/.{2}/g)!.map(x => parseInt(x, 16)));
}
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unbase64url(encoded: string): Uint8Array {
  const base = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base.padEnd(Math.ceil(base.length / 4) * 4, '='));
  return Uint8Array.from(binary, x => x.charCodeAt(0));
}
function secret(env: { JWT_SECRET?: string }): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe estar configurado con 32 caracteres o más');
  }
  return env.JWT_SECRET;
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${toHex(bits)}`;
}
export async function comparePassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, iter, saltHex, hashHex] = (stored || '').split('$');
    if (algo !== 'pbkdf2' || !/^\d+$/.test(iter)) return false;
    const iterations = Number(iter);
    if (iterations < 50_000 || iterations > 1_000_000) return false;
    const salt = fromHex(saltHex);
    const expected = fromHex(hashHex);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const result = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, expected.length * 8));
    if (result.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < result.length; i++) diff |= result[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}
async function signingKey(value: string, operation: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, [operation]);
}
async function sign(payload: JwtPayload, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = `${base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(value, 'sign'), encoder.encode(data));
  return `${data}.${base64url(new Uint8Array(signature))}`;
}
export async function verifyToken(token: string, value: string): Promise<JwtPayload | null> {
  try {
    const pieces = token.split('.');
    if (pieces.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(unbase64url(pieces[0])));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const ok = await crypto.subtle.verify('HMAC', await signingKey(value, 'verify'), unbase64url(pieces[2]), new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unbase64url(pieces[1]))) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sid || !payload.user_id || !['admin', 'customer'].includes(payload.type) || !['access', 'refresh'].includes(payload.kind) || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.iat > now + 60) return null;
    return payload;
  } catch { return null; }
}
export async function generateTokenPair(env: { JWT_SECRET?: string }, userId: string, type: 'customer' | 'admin', role: string, sessionId: string): Promise<{ access_token: string; refresh_token: string }> {
  const now = Math.floor(Date.now() / 1000);
  const common = { user_id: userId, type, role, sid: sessionId, iat: now };
  const value = secret(env);
  return {
    access_token: await sign({ ...common, kind: 'access', exp: now + ACCESS_TTL }, value),
    refresh_token: await sign({ ...common, kind: 'refresh', exp: now + REFRESH_TTL }, value),
  };
}
export async function extractToken(header: string | null | undefined, env: { JWT_SECRET?: string }): Promise<JwtPayload | null> {
  if (!header?.startsWith('Bearer ')) return null;
  const token = await verifyToken(header.slice(7), env.JWT_SECRET || '');
  return token?.kind === 'access' ? token : null;
}
