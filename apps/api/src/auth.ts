/**
 * Módulo de autenticación JWT y hashing de contraseñas.
 *
 * - Hashing de contraseñas con PBKDF2 / SHA-256 (Web Crypto).
 * - Firmado y verificación de JWTs HS256 (Web Crypto crypto.subtle).
 * - No depende de paquetes externos: funciona dentro de Cloudflare Workers.
 *
 * Formatos:
 *   password_hash → "pbkdf2$<iterations>$<saltHex>$<hashHex>"
 *   JWT           → estándar HS256 (header.payload.signature)
 */

export interface JwtPayload {
  user_id: string;
  type: 'customer' | 'admin';
  role?: string;
  exp: number;
  iat: number;
}

const ACCESS_TOKEN_TTL = 60 * 60;           // 1 hora  (segundos)
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 días
const PBKDF2_ITERATIONS = 100_000;

/* -------------------------------------------------------------------------- */
/*  Utilidades de codificación                                                */
/* -------------------------------------------------------------------------- */

/** Codifica un ArrayBuffer a string hexadecimal. */
function buf2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decodifica un string hexadecimal a Uint8Array. */
function hex2buf(hex: string): Uint8Array {
  const len = hex.length / 2;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

/** Codifica un ArrayBuffer a base64url sin padding. */
function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  if (buf instanceof Uint8Array) buf = buf.buffer as ArrayBuffer;
  const bytes = Array.from(new Uint8Array(buf));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Decodifica un base64url string a Uint8Array. */
function base64urlDecode(str: string): Uint8Array {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* -------------------------------------------------------------------------- */
/*  Password hashing (PBKDF2)                                                 */
/* -------------------------------------------------------------------------- */

/** Genera un salt aleatorio de 16 bytes (hex). */
function randomSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return buf2hex(salt.buffer);
}

/**
 * Hash una contraseña con PBKDF2-SHA-256.
 * Resultado: "pbkdf2$<iterations>$<saltHex>$<hashHex>"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomSalt();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${buf2hex(derived)}`;
}

/**
 * Verifica una contraseña contra un hash PBKDF2.
 */
export async function comparePassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedHash = parts[3];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  const computed = buf2hex(derived);
  return constTimeEqual(hex2buf(computed), hex2buf(expectedHash));
}

/** Verifica dos buffers de la misma longitud de forma const-time. */
function constTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/*  JWT (HS256) — implementación nativa                                      */
/* -------------------------------------------------------------------------- */

/** Obtiene el secret de JWT del env, lanza si falta. */
function getJwtSecret(env: { JWT_SECRET?: string }): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET no configurado o demasiado corto (>=16 chars)');
  }
  return env.JWT_SECRET;
}

/** Firma y devuelve un JWT HS256. */
export async function signToken(
  payload: Omit<JwtPayload, 'exp' | 'iat'>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(full)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const sigB64 = base64urlEncode(sig);
  return `${signingInput}.${sigB64}`;
}

/** Verifica un JWT HS256 y devuelve el payload, o null si es inválido/expirado. */
export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const signingInput = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['verify']);
    const decoder = new TextDecoder();
    const payloadJson = decoder.decode(base64urlDecode(payloadB64));
    const payload: JwtPayload = JSON.parse(payloadJson);
    const sigBytes = base64urlDecode(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));
    if (!valid) return null;
    if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Genera un par access + refresh token. */
export async function generateTokenPair(
  env: { JWT_SECRET?: string },
  userId: string,
  type: 'customer' | 'admin',
  role?: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const secret = getJwtSecret(env);
  const commonPayload = { user_id: userId, type, ...(role ? { role } : {}) };
  const access = await signToken(commonPayload, secret, ACCESS_TOKEN_TTL);
  const refresh = await signToken(commonPayload, secret, REFRESH_TOKEN_TTL);
  return { access_token: access, refresh_token: refresh };
}

/** Extrae y verifica el Bearer token del header Authorization. */
export async function extractToken(
  authHeader: string | null | undefined,
  env: { JWT_SECRET?: string },
): Promise<JwtPayload | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  return verifyToken(token, env.JWT_SECRET || '');
}
